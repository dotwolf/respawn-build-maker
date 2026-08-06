package handlers

import (
	"main/apps/api/internal/dto"
	"main/apps/api/internal/services"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

// CreateTemplate godoc
// @Summary      Create a new template with components
// @Description  Creates a new template along with its component pool atomically inside a transaction
// @Tags         templates
// @Accept       json
// @Produce      json
// @Param        request body dto.TemplateCreateRequest true "Template creation data"
// @Success      201  {object}  dto.TemplateResponse
// @Failure      400  {object}  map[string]string
// @Failure      500  {object}  map[string]string
// @Router       /templates [post]
func CreateTemplate(templateService services.TemplateServiceInterface) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req dto.TemplateCreateRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body: " + err.Error()})
			return
		}

		creatorUserID := RequesterID(c)
		if creatorUserID <= 0 {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
			return
		}

		template, err := templateService.CreateTemplateWithComponents(c.Request.Context(), creatorUserID, &req)
		if err != nil {
			respondError(c, err)
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
func GetTemplateByID(templateService services.TemplateServiceInterface) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("template_id")
		if id == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Template id is required"})
			return
		}

		template, err := templateService.GetTemplateByIDForUser(c.Request.Context(), id, RequesterID(c))
		if err != nil {
			respondError(c, err)
			return
		}
		c.JSON(http.StatusOK, template)
	}
}

func UpdateTemplate(templateService services.TemplateServiceInterface) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req dto.TemplateUpdateRequest
		if err := c.ShouldBindJSON(&req); err != nil { c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body: " + err.Error()}); return }
		req.ID = c.Param("template_id")
		template, err := templateService.UpdateTemplate(c.Request.Context(), RequesterID(c), &req)
		if err != nil {
			respondError(c, err)
			return
		}
		c.JSON(http.StatusOK, template)
	}
}

func DeleteTemplate(templateService services.TemplateServiceInterface) gin.HandlerFunc {
	return func(c *gin.Context) {
		err := templateService.DeleteTemplate(c.Request.Context(), RequesterID(c), c.Param("template_id"))
		if err != nil {
			respondError(c, err)
			return
		}
		c.Status(http.StatusNoContent)
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
func ListTemplatesByUser(templateService services.TemplateServiceInterface) gin.HandlerFunc {
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
		if limit > 100 {
			limit = 100
		}
		offset, err := strconv.Atoi(offsetStr)
		if err != nil || offset < 0 {
			offset = 0
		}

		templates, err := templateService.ListTemplatesByUser(c.Request.Context(), int32(userID), RequesterID(c), int32(limit), int32(offset))
		if err != nil {
			respondError(c, err)
			return
		}
		if len(templates) == 0 {
			c.JSON(http.StatusOK, []dto.TemplateResponse{})
			return
		}
		c.JSON(http.StatusOK, templates)
	}
}

// ListTemplates godoc
// @Summary      List templates
// @Description  List public templates or filter by user ID with pagination
// @Tags         templates
// @Accept       json
// @Produce      json
// @Param        user_id query int false "Creator user ID filter"
// @Param        limit query int false "Page size"
// @Param        offset query int false "Page offset"
// @Success      200  {array}   dto.TemplateResponse
// @Failure      400  {object}  map[string]string
// @Failure      500  {object}  map[string]string
// @Router       /templates [get]
func ListTemplates(templateService services.TemplateServiceInterface) gin.HandlerFunc {
	return func(c *gin.Context) {
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

		userIDStr := c.Query("user_id")
		var templates []*dto.TemplateResponse

		if userIDStr != "" {
			userID, err := strconv.Atoi(userIDStr)
			if err != nil || userID <= 0 {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user_id"})
				return
			}
			templates, err = templateService.ListTemplatesByUser(c.Request.Context(), int32(userID), RequesterID(c), int32(limit), int32(offset))
		} else {
			templates, err = templateService.ListPublicTemplates(c.Request.Context(), int32(limit), int32(offset))
		}

		if err != nil {
			respondError(c, err)
			return
		}
		if len(templates) == 0 {
			c.JSON(http.StatusOK, []dto.TemplateResponse{})
			return
		}
		c.JSON(http.StatusOK, templates)
	}
}
