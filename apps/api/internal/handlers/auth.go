package handlers

import (
	"main/apps/api/internal/dto"
	"main/apps/api/internal/services"
	"net/http"

	"github.com/gin-gonic/gin"
)

func Login(authService services.AuthServiceInterface) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req dto.LoginRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
			return
		}

		token, profile, err := authService.Login(c.Request.Context(), &req)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"token": token, "user": profile})
	}
}
