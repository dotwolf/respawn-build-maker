package auth

import (
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const testSecret = "test-secret-value"

func TestCreateAndParseToken(t *testing.T) {
	token, err := CreateToken(testSecret, 42, "alice")
	require.NoError(t, err)

	claims, err := ParseToken(testSecret, token)
	require.NoError(t, err)
	assert.Equal(t, int32(42), claims.UserID)
	assert.Equal(t, "alice", claims.Username)
	assert.Equal(t, Issuer, claims.Issuer)
}

func TestParseTokenRejectsWrongSecret(t *testing.T) {
	token, err := CreateToken(testSecret, 42, "alice")
	require.NoError(t, err)

	_, err = ParseToken("different-secret", token)
	assert.Error(t, err)
}

func TestParseTokenRejectsWrongIssuer(t *testing.T) {
	signed := signForTest(t, jwt.SigningMethodHS256, testSecret, func(c *Claims) {
		c.Issuer = "evil-issuer"
	})

	_, err := ParseToken(testSecret, signed)
	assert.Error(t, err)
}

func TestParseTokenRejectsWrongAlg(t *testing.T) {
	signed := signForTest(t, jwt.SigningMethodHS512, testSecret, nil)

	_, err := ParseToken(testSecret, signed)
	assert.Error(t, err)
}

func TestParseTokenRejectsMissingExpiration(t *testing.T) {
	signed := signForTest(t, jwt.SigningMethodHS256, testSecret, func(c *Claims) {
		c.ExpiresAt = nil
	})

	_, err := ParseToken(testSecret, signed)
	assert.Error(t, err)
}

func TestParseTokenRejectsZeroUserID(t *testing.T) {
	signed := signForTest(t, jwt.SigningMethodHS256, testSecret, func(c *Claims) {
		c.UserID = 0
	})

	_, err := ParseToken(testSecret, signed)
	assert.Error(t, err)
}

func signForTest(t *testing.T, method jwt.SigningMethod, secret string, mutate func(*Claims)) string {
	t.Helper()
	claims := Claims{
		UserID:   42,
		Username: "alice",
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    Issuer,
			Audience:  jwt.ClaimStrings{Audience},
			Subject:   "alice",
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			NotBefore: jwt.NewNumericDate(time.Now()),
		},
	}
	if mutate != nil {
		mutate(&claims)
	}
	token := jwt.NewWithClaims(method, claims)
	signed, err := token.SignedString([]byte(secret))
	require.NoError(t, err)
	return signed
}
