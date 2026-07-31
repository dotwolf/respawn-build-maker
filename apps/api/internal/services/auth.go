package services

import (
	"context"
	"errors"
	"main/apps/api/internal/auth"
	"main/apps/api/internal/dto"
	"main/apps/api/internal/repository"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

type AuthService struct {
	queries *repository.Queries
}

func NewAuthService(pool *pgxpool.Pool) *AuthService {
	return &AuthService{queries: repository.New(pool)}
}

func (s *AuthService) Login(ctx context.Context, req *dto.LoginRequest) (string, *dto.PrivateProfileResponse, error) {
	user, err := s.queries.GetUserByEmail(ctx, req.Email)
	if err != nil {
		return "", nil, err
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(req.Password)); err != nil {
		return "", nil, errors.New("invalid email or password")
	}

	token, err := auth.CreateToken(os.Getenv("JWT_SECRET"), user.ID, user.Username)
	if err != nil {
		return "", nil, err
	}

	return token, dto.ToPrivateProfile(&user), nil
}

func (s *AuthService) VerifyToken(token string) (*auth.Claims, error) {
	return auth.ParseToken(os.Getenv("JWT_SECRET"), token)
}
