package handlers

import (
	"main/apps/api/internal/dto"
	"main/apps/api/internal/services"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

// CreateTemplate godoc
// @Summary      Create a new template
// @Description  Creates a new template with a component pool and rules
// @Tags         templates
// @Accept       json
// @Produce      json
// @Param        request body dto.TemplateCreateRequest true "Template creation data"
// @Success      201  {object}  dto.TemplateResponse
// @Failure      400  {object}  map[string]string
// @Failure      500  {object}  map[string]string
// @Router       /templates [post]
func CreateTemplate(templateService *services.TemplateService) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req dto.TemplateCreateRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
			return
		}

		template, err := templateService.CreateTemplate(c.Request.Context(), &req)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusCreated, template)
	}
}

// GetTemplateByID godoc
// @Summary      Get a template by ID
// @Description  Returns a single template by identifier
// @Tags         templates
// @Accept       json
// @Produce      json
// @Param        id path string true "Template ID"
// @Success      200  {object}  dto.TemplateResponse
// @Failure      400  {object}  map[string]string
// @Failure      404  {object}  map[string]string
// @Failure      500  {object}  map[string]string
// @Router       /templates/{id} [get]
func GetTemplateByID(templateService *services.TemplateService) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("template_id")
		if id == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Template id is required"})
			return
		}

		template, err := templateService.GetTemplateByID(c.Request.Context(), id)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Template not found"})
			return
		}
		c.JSON(http.StatusOK, template)
	}
}

// ListTemplatesByUser godoc
// @Summary      List templates by user
// @Description  List templates created by a user with pagination
// @Tags         templates
// @Accept       json
// @Produce      json
// @Param        user_id query int true "Creator user ID"
// @Param        limit query int false "Page size"
// @Param        offset query int false "Page offset"
// @Success      200  {array}   dto.TemplateResponse
// @Failure      400  {object}  map[string]string
// @Failure      500  {object}  map[string]string
// @Router       /templates [get]
func ListTemplatesByUser(templateService *services.TemplateService) gin.HandlerFunc {
	return func(c *gin.Context) {
		userIDStr := c.Query("user_id")
		if userIDStr == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "user_id is required"})
			return
		}

		userID, err := strconv.Atoi(userIDStr)
		if err != nil || userID <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user_id"})
			return
		}

		limitStr := c.DefaultQuery("limit", "20")
		offsetStr := c.DefaultQuery("offset", "0")

		limit, err := strconv.Atoi(limitStr)
		if err != nil || limit < 1 {
			limit = 20
		}
		offset, err := strconv.Atoi(offsetStr)
		if err != nil || offset < 0 {
			offset = 0
		}

		templates, err := templateService.ListTemplatesByUser(c.Request.Context(), int32(userID), int32(limit), int32(offset))
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if len(templates) == 0 {
			c.JSON(http.StatusOK, []dto.TemplateResponse{})
			return
		}
		c.JSON(http.StatusOK, templates)
	}
}
