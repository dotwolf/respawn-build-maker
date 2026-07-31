package handlers

import (
	"main/apps/api/internal/dto"
	"main/apps/api/internal/services"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

// CreateBuild godoc
// @Summary      Create a new build
// @Description  Creates a build from a template
// @Tags         builds
// @Accept       json
// @Produce      json
// @Param        template_id path string true "Template ID"
// @Param        request body dto.BuildCreateRequest true "Build creation data"
// @Success      201  {object}  dto.BuildResponse
// @Failure      400  {object}  map[string]string
// @Failure      500  {object}  map[string]string
// @Router       /templates/{template_id}/builds [post]
func CreateBuild(buildService services.BuildServiceInterface) gin.HandlerFunc {
	return func(c *gin.Context) {
		templateID := c.Param("template_id")
		if templateID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "template_id is required"})
			return
		}

		var req dto.BuildCreateRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
			return
		}

		build, err := buildService.CreateBuild(c.Request.Context(), templateID, &req)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusCreated, build)
	}
}

// GetBuildByID godoc
// @Summary      Get a build by ID
// @Description  Returns a single build by identifier
// @Tags         builds
// @Accept       json
// @Produce      json
// @Param        template_id path string true "Template ID"
// @Param        build_id path string true "Build ID"
// @Success      200  {object}  dto.BuildResponse
// @Failure      400  {object}  map[string]string
// @Failure      404  {object}  map[string]string
// @Failure      500  {object}  map[string]string
// @Router       /templates/{template_id}/builds/{build_id} [get]
func GetBuildByID(buildService services.BuildServiceInterface) gin.HandlerFunc {
	return func(c *gin.Context) {
		templateID := c.Param("template_id")
		if templateID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "template_id is required"})
			return
		}

		buildID := c.Param("build_id")
		if buildID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Build id is required"})
			return
		}

		build, err := buildService.GetBuildByID(c.Request.Context(), templateID, buildID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Build not found"})
			return
		}
		c.JSON(http.StatusOK, build)
	}
}

// ListBuildsByTemplate godoc
// @Summary      List builds by template
// @Description  List builds associated with a template
// @Tags         builds
// @Accept       json
// @Produce      json
// @Param        template_id path string true "Template ID"
// @Param        user_id query int false "Creator user ID"
// @Param        limit query int false "Page size"
// @Param        offset query int false "Page offset"
// @Success      200  {array}   dto.BuildResponse
// @Failure      400  {object}  map[string]string
// @Failure      500  {object}  map[string]string
// @Router       /templates/{template_id}/builds [get]
func ListBuildsByTemplate(buildService services.BuildServiceInterface) gin.HandlerFunc {
	return func(c *gin.Context) {
		templateID := c.Param("template_id")
		if templateID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "template_id is required"})
			return
		}

		var userID *int32
		if userIDStr := c.Query("user_id"); userIDStr != "" {
			parsedUserID, err := strconv.Atoi(userIDStr)
			if err != nil || parsedUserID <= 0 {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user_id"})
				return
			}
			parsed := int32(parsedUserID)
			userID = &parsed
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

		builds, err := buildService.ListBuildsByTemplate(c.Request.Context(), templateID, int32(limit), int32(offset))
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if userID != nil {
			filtered := make([]*dto.BuildResponse, 0, len(builds))
			for _, build := range builds {
				if build != nil && build.CreatorUserID == *userID {
					filtered = append(filtered, build)
				}
			}
			builds = filtered
		}
		if len(builds) == 0 {
			c.JSON(http.StatusOK, []dto.BuildResponse{})
			return
		}
		c.JSON(http.StatusOK, builds)
	}
}
