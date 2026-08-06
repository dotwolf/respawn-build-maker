package services

import (
	"context"
	"crypto/rand"
	"fmt"
	"main/apps/api/internal/auth"
	"main/apps/api/internal/dto"
	"main/apps/api/internal/repository"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

type AuthService struct {
	queries        *repository.Queries
	googleVerifier *auth.GoogleVerifier
}

// NewAuthService creates an AuthService. Pass the Google OAuth client ID to
// enable Google sign-in; omit it (or pass an empty string) to leave it
// disabled until the server is configured.
func NewAuthService(pool *pgxpool.Pool, googleClientID ...string) *AuthService {
	s := &AuthService{queries: repository.New(pool)}
	if len(googleClientID) > 0 && googleClientID[0] != "" {
		s.googleVerifier = auth.NewGoogleVerifier(googleClientID[0])
	}
	return s
}

func (s *AuthService) Login(ctx context.Context, req *dto.LoginRequest) (string, *dto.PrivateProfileResponse, error) {
	user, err := s.queries.GetUserByEmail(ctx, req.Email)
	if err != nil {
		if err == pgx.ErrNoRows {
			return "", nil, ErrUnauthorized
		}
		return "", nil, err
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(req.Password)); err != nil {
		return "", nil, ErrUnauthorized
	}

	return s.issueToken(&user)
}

// LoginWithGoogle verifies a Google ID token and returns an app JWT, creating
// an account on first sign-in or linking the Google identity to an existing
// account with the same email.
func (s *AuthService) LoginWithGoogle(ctx context.Context, req *dto.GoogleLoginRequest) (string, *dto.PrivateProfileResponse, error) {
	if s.googleVerifier == nil {
		return "", nil, ErrGoogleNotConfigured
	}

	claims, err := s.googleVerifier.Verify(ctx, req.IDToken)
	if err != nil {
		return "", nil, ErrUnauthorized
	}

	googleSub := pgtype.Text{String: claims.Subject, Valid: true}

	user, err := s.queries.GetUserByGoogleSub(ctx, googleSub)
	if err == nil {
		return s.issueToken(&user)
	}
	if err != pgx.ErrNoRows {
		return "", nil, err
	}

	user, err = s.queries.GetUserByEmail(ctx, claims.Email)
	if err == nil {
		linked, err := s.queries.LinkUserGoogleSub(ctx, repository.LinkUserGoogleSubParams{
			GoogleSub: googleSub,
			UpdatedAt: pgtype.Timestamptz{Time: time.Now(), Valid: true},
			ID:        user.ID,
		})
		if err != nil {
			return "", nil, err
		}
		return s.issueToken(&linked)
	}
	if err != pgx.ErrNoRows {
		return "", nil, err
	}

	username, err := s.uniqueUsername(ctx, claims, req.Username)
	if err != nil {
		return "", nil, err
	}

	password, err := unusablePassword()
	if err != nil {
		return "", nil, err
	}

	now := time.Now()
	created, err := s.queries.CreateUser(ctx, repository.CreateUserParams{
		Username:  username,
		Email:     claims.Email,
		Password:  password,
		GoogleSub: googleSub,
		CreatedAt: pgtype.Timestamptz{Time: now, Valid: true},
		UpdatedAt: pgtype.Timestamptz{Time: now, Valid: true},
	})
	if err != nil {
		return "", nil, err
	}

	return s.issueToken(&created)
}

func (s *AuthService) VerifyToken(token string) (*auth.Claims, error) {
	return auth.ParseToken("", token)
}

func (s *AuthService) issueToken(user *repository.User) (string, *dto.PrivateProfileResponse, error) {
	token, err := auth.CreateToken("", user.ID, user.Username)
	if err != nil {
		return "", nil, err
	}
	return token, dto.ToPrivateProfile(user), nil
}

// uniqueUsername derives a username for a new Google account, honoring the
// requested name when available and otherwise falling back to the display name
// or the email local part, then deduping with a numeric suffix.
func (s *AuthService) uniqueUsername(ctx context.Context, claims *auth.GoogleClaims, requested string) (string, error) {
	base := sanitizeUsername(requested)
	if base == "" {
		base = sanitizeUsername(claims.Name)
	}
	if base == "" {
		base = sanitizeUsername(strings.SplitN(claims.Email, "@", 2)[0])
	}
	if base == "" {
		base = "user"
	}
	for len(base) < 4 {
		base += "_"
	}

	candidate := base
	for i := 2; i <= 10000; i++ {
		available, err := s.usernameAvailable(ctx, candidate)
		if err != nil {
			return "", err
		}
		if available {
			return candidate, nil
		}
		suffix := fmt.Sprintf("%d", i)
		candidate = base
		if len(candidate)+len(suffix) > 30 {
			candidate = candidate[:30-len(suffix)]
		}
		candidate += suffix
	}
	return "", validationError("unable to allocate a unique username")
}

func (s *AuthService) usernameAvailable(ctx context.Context, username string) (bool, error) {
	_, err := s.queries.GetUserByUsername(ctx, username)
	if err == pgx.ErrNoRows {
		return true, nil
	}
	if err != nil {
		return false, err
	}
	return false, nil
}

func sanitizeUsername(s string) string {
	re := regexp.MustCompile(`[^a-zA-Z0-9_]`)
	s = re.ReplaceAllString(s, "")
	if len(s) > 30 {
		s = s[:30]
	}
	return s
}

// unusablePassword returns a bcrypt hash of random bytes so Google-created
// accounts can never be signed into with a password.
func unusablePassword() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	hash, err := bcrypt.GenerateFromPassword(buf, bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(hash), nil
}
