package auth

import (
	"errors"
	"os"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const (
	Issuer        = "respawn-build-maker"
	Audience      = "respawn-build-maker-web"
	TokenLifetime = 24 * time.Hour
)

type Claims struct {
	UserID   int32  `json:"user_id"`
	Username string `json:"username"`
	jwt.RegisteredClaims
}

// Secret returns the JWT signing secret, preferring an explicitly provided
// value over the JWT_SECRET_KEY environment variable.
func Secret(secret string) string {
	if secret != "" {
		return secret
	}
	return os.Getenv("JWT_SECRET_KEY")
}

func CreateToken(secret string, userID int32, username string) (string, error) {
	secret = Secret(secret)
	if secret == "" {
		return "", errors.New("missing jwt secret")
	}

	now := time.Now()
	claims := Claims{
		UserID:   userID,
		Username: username,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    Issuer,
			Audience:  jwt.ClaimStrings{Audience},
			Subject:   username,
			ExpiresAt: jwt.NewNumericDate(now.Add(TokenLifetime)),
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(secret))
}

func ParseToken(secret, tokenString string) (*Claims, error) {
	secret = Secret(secret)
	if secret == "" {
		return nil, errors.New("missing jwt secret")
	}

	token, err := jwt.ParseWithClaims(
		tokenString,
		&Claims{},
		func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, errors.New("unexpected signing method")
			}
			return []byte(secret), nil
		},
		jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}),
		jwt.WithIssuer(Issuer),
		jwt.WithAudience(Audience),
		jwt.WithExpirationRequired(),
		jwt.WithIssuedAt(),
	)
	if err != nil {
		return nil, err
	}

	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid || claims.UserID <= 0 {
		return nil, errors.New("invalid token")
	}

	return claims, nil
}
