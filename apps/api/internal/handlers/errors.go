package handlers

import (
	"errors"
	"net/http"

	"main/apps/api/internal/auth"
	"main/apps/api/internal/services"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
)

// RequesterID returns the authenticated user ID from the request context, or
// 0 for unauthenticated requests.
func RequesterID(c *gin.Context) int32 {
	if claims, ok := auth.GetClaims(c); ok {
		return claims.UserID
	}
	return 0
}

// respondError maps service errors to HTTP responses. Internal failures are
// logged and surfaced generically so implementation details are not leaked.
func respondError(c *gin.Context, err error) {
	if err == nil {
		return
	}

	switch {
	case errors.Is(err, services.ErrUnauthorized):
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
	case errors.Is(err, services.ErrForbidden):
		c.JSON(http.StatusForbidden, gin.H{"error": "you do not have permission to do that"})
	case errors.Is(err, services.ErrNotFound), errors.Is(err, pgx.ErrNoRows):
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
	case errors.Is(err, services.ErrGoogleNotConfigured):
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "google login is not configured"})
	default:
		var ve *services.ValidationError
		if errors.As(err, &ve) {
			c.JSON(http.StatusBadRequest, gin.H{"error": ve.Message})
			return
		}
		var ce *services.ConflictError
		if errors.As(err, &ce) {
			c.JSON(http.StatusConflict, gin.H{"error": ce.Message})
			return
		}
		_ = c.Error(err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal server error"})
	}
}
