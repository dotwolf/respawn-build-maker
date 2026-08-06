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
			respondError(c, err)
			return
		}

		c.JSON(http.StatusOK, gin.H{"token": token, "user": profile})
	}
}

func GoogleLogin(authService services.AuthServiceInterface) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req dto.GoogleLoginRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
			return
		}

		token, profile, err := authService.LoginWithGoogle(c.Request.Context(), &req)
		if err != nil {
			respondError(c, err)
			return
		}

		c.JSON(http.StatusOK, gin.H{"token": token, "user": profile})
	}
}
