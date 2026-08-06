package auth

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

const ClaimsKey = "authClaims"

// RequireAuth accepts a token verification function to avoid importing the
// services package and creating import cycles.
func RequireAuth(verify func(string) (*Claims, error)) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "authorization header required"})
			return
		}

		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "authorization header format must be Bearer {token}"})
			return
		}

		claims, err := verify(parts[1])
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid or expired token"})
			return
		}

		c.Set(ClaimsKey, claims)
		c.Next()
	}
}

// OptionalAuth parses the Bearer token when present and stores the claims,
// but never rejects unauthenticated requests. Use it on public read routes
// that may personalize results for signed-in users.
func OptionalAuth(verify func(string) (*Claims, error)) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.Next()
			return
		}

		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || !strings.EqualFold(parts[0], "bearer") {
			c.Next()
			return
		}

		claims, err := verify(parts[1])
		if err != nil {
			c.Next()
			return
		}

		c.Set(ClaimsKey, claims)
		c.Next()
	}
}

func GetClaims(c *gin.Context) (*Claims, bool) {
	raw, ok := c.Get(ClaimsKey)
	if !ok {
		return nil, false
	}
	claims, ok := raw.(*Claims)
	return claims, ok
}
