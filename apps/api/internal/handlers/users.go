package handlers

import (
	"main/apps/api/internal/dto"
	"main/apps/api/internal/repository"
	"main/apps/api/internal/services"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

// CreateUser godoc
// @Summary      Create a new user
// @Description  Registers a new user with username, email, and password
// @Tags         users
// @Accept       json
// @Produce      json
// @Param        request body dto.UserRegisterRequest true "User registration data"
// @Success      201  {object}  dto.PrivateProfileResponse
// @Failure      400  {object}  map[string]string
// @Failure      409  {object}  map[string]string
// @Failure      500  {object}  map[string]string
// @Router       /users [post]
func CreateUser(UserService *services.UserService) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req dto.UserRegisterRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
			return
		}
		user, err := UserService.CreateUser(c.Request.Context(), &req)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusCreated, user)
	}
}

// GetUserByQuery godoc
// @Summary      Get user(s) by query parameters
// @Description  Get a single user by username or ID, or list all users with pagination
// @Tags         users
// @Accept       json
// @Produce      json
// @Param        username query string false "Username to search for"
// @Param        id query int false "User ID to search for"
// @Param        limit query int false "Number of results per page (default: 20, max: 100)"
// @Param        offset query int false "Number of results to skip (default: 0)"
// @Success      200  {object}  dto.PublicProfileResponse "Single user found by username/id"
// @Success      200  {object}  []dto.PublicProfileResponse "List of users with pagination"
// @Failure      400  {object}  map[string]string "Invalid query parameter"
// @Failure      404  {object}  map[string]string "User not found"
// @Failure      500  {object}  map[string]string "Internal server error"
// @Router       /users [get]
func GetUserByQuery(UserService *services.UserService) gin.HandlerFunc {
	return func(c *gin.Context) {
		if username := c.Query("username"); username != "" {
			user, err := UserService.GetUserByUsername(c.Request.Context(), username)
			if err != nil {
				c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
				return
			}
			c.JSON(http.StatusOK, user)
			return
		}

		if idStr := c.Query("id"); idStr != "" {
			id, err := strconv.Atoi(idStr)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
				return
			}
			user, err := UserService.GetUserById(c.Request.Context(), int32(id))
			if err != nil {
				c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
				return
			}
			c.JSON(http.StatusOK, user)
			return
		}

		limitStr := c.DefaultQuery("limit", "20")
		offsetStr := c.DefaultQuery("offset", "0")

		limit, err := strconv.Atoi(limitStr)
		if err != nil || limit < 1 {
			limit = 20
		}
		if limit > 100 {
			limit = 100
		}

		offset, err := strconv.Atoi(offsetStr)
		if err != nil || offset < 0 {
			offset = 0
		}

		var req = repository.ListUsersParams{
			Limit:  int32(limit),
			Offset: int32(offset),
		}
		users, err := UserService.ListUsers(c.Request.Context(), req)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if len(users) == 0 {
			c.JSON(http.StatusOK, []dto.PublicProfileResponse{}) // Return empty array, not null
			return
		}
		c.JSON(http.StatusOK, users)
	}
}

// DeleteUser godoc
// @Summary      Delete a user
// @Description  Permanently deletes a user by ID (requires authentication)
// @Tags         users
// @Accept       json
// @Produce      json
// @Param        id path int true "User ID"
// @Success      200  {object}  map[string]string "message: User deleted successfully"
// @Failure      400  {object}  map[string]string "Invalid user ID"
// @Failure      404  {object}  map[string]string "User not found"
// @Failure      500  {object}  map[string]string "Internal server error"
// @Security     BearerAuth
// @Router       /users/{id} [delete]
func DeleteUser(UserService *services.UserService) gin.HandlerFunc {
	return func(c *gin.Context) {
		idStr := c.Param("id")
		id, err := strconv.Atoi(idStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
			return
		}
		err = UserService.DeleteUser(c.Request.Context(), int32(id))
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "User deleted successfully"})
	}
}
