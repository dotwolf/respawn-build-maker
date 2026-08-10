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

		creatorUserID := RequesterID(c)
		if creatorUserID <= 0 {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
			return
		}

		build, err := buildService.CreateBuild(c.Request.Context(), templateID, creatorUserID, &req)
		if err != nil {
			respondError(c, err)
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

		build, err := buildService.GetBuildByID(c.Request.Context(), templateID, buildID, RequesterID(c))
		if err != nil {
			respondError(c, err)
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
		if limit > 100 {
			limit = 100
		}
		offset, err := strconv.Atoi(offsetStr)
		if err != nil || offset < 0 {
			offset = 0
		}

		builds, err := buildService.ListBuildsByTemplate(c.Request.Context(), templateID, RequesterID(c), int32(limit), int32(offset))
		if err != nil {
			respondError(c, err)
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

// ListBuildsByUser godoc
// @Summary      List builds created by the authenticated user
// @Description  Returns the builds created by the currently authenticated user, including private ones
// @Tags         builds
// @Accept       json
// @Produce      json
// @Param        limit query int false "Page size"
// @Param        offset query int false "Page offset"
// @Success      200  {array}   dto.BuildResponse
// @Failure      400  {object}  map[string]string
// @Failure      500  {object}  map[string]string
// @Router       /builds [get]
func ListBuildsByUser(buildService services.BuildServiceInterface) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := RequesterID(c)
		if userID <= 0 {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
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

		builds, err := buildService.ListBuildsByUser(c.Request.Context(), userID, int32(limit), int32(offset))
		if err != nil {
			respondError(c, err)
			return
		}
		if len(builds) == 0 {
			c.JSON(http.StatusOK, []dto.BuildResponse{})
			return
		}
		c.JSON(http.StatusOK, builds)
	}
}

// CountBuildsByUser godoc
// @Summary      Count builds created by the authenticated user
// @Description  Returns the total number of builds created by the authenticated user, including private ones
// @Tags         builds
// @Accept       json
// @Produce      json
// @Success      200  {object}  map[string]int64
// @Failure      401  {object}  map[string]string
// @Failure      500  {object}  map[string]string
// @Router       /builds/count [get]
func CountBuildsByUser(buildService services.BuildServiceInterface) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := RequesterID(c)
		if userID <= 0 {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
			return
		}

		count, err := buildService.CountBuildsByUser(c.Request.Context(), userID)
		if err != nil {
			respondError(c, err)
			return
		}
		c.JSON(http.StatusOK, gin.H{"count": count})
	}
}

// ListPublicBuilds godoc
// @Summary      List public builds
// @Description  List publicly visible builds with an optional template filter, enriched with creator and template names
// @Tags         builds
// @Accept       json
// @Produce      json
// @Param        template_id query string false "Template ID filter"
// @Param        limit query int false "Page size"
// @Param        offset query int false "Page offset"
// @Success      200  {array}   dto.BuildResponse
// @Failure      400  {object}  map[string]string
// @Failure      500  {object}  map[string]string
// @Router       /public/builds [get]
func ListPublicBuilds(buildService services.BuildServiceInterface) gin.HandlerFunc {
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

		builds, err := buildService.ListPublicBuilds(c.Request.Context(), c.Query("template_id"), int32(limit), int32(offset))
		if err != nil {
			respondError(c, err)
			return
		}
		if len(builds) == 0 {
			c.JSON(http.StatusOK, []dto.BuildResponse{})
			return
		}
		c.JSON(http.StatusOK, builds)
	}
}

// ListLikedBuilds godoc
// @Summary      List builds liked by the authenticated user
// @Description  Returns the builds the currently authenticated user has upvoted
// @Tags         builds
// @Accept       json
// @Produce      json
// @Param        limit query int false "Page size"
// @Param        offset query int false "Page offset"
// @Success      200  {array}   dto.BuildResponse
// @Failure      400  {object}  map[string]string
// @Failure      401  {object}  map[string]string
// @Failure      500  {object}  map[string]string
// @Router       /builds/liked [get]
func ListLikedBuilds(buildService services.BuildServiceInterface) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := RequesterID(c)
		if userID <= 0 {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
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

		builds, err := buildService.ListLikedBuilds(c.Request.Context(), userID, int32(limit), int32(offset))
		if err != nil {
			respondError(c, err)
			return
		}
		if len(builds) == 0 {
			c.JSON(http.StatusOK, []dto.BuildResponse{})
			return
		}
		c.JSON(http.StatusOK, builds)
	}
}

// CountLikedBuildsByUser godoc
// @Summary      Count builds liked by the authenticated user
// @Description  Returns the total number of builds the authenticated user has upvoted
// @Tags         builds
// @Accept       json
// @Produce      json
// @Success      200  {object}  map[string]int64
// @Failure      401  {object}  map[string]string
// @Failure      500  {object}  map[string]string
// @Router       /builds/liked/count [get]
func CountLikedBuildsByUser(buildService services.BuildServiceInterface) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := RequesterID(c)
		if userID <= 0 {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
			return
		}

		count, err := buildService.CountLikedBuildsByUser(c.Request.Context(), userID)
		if err != nil {
			respondError(c, err)
			return
		}
		c.JSON(http.StatusOK, gin.H{"count": count})
	}
}

// UpdateBuildByID godoc
// @Summary      Update an existing build
// @Description  Updates a build if the authenticated user is its creator
// @Tags         builds
// @Accept       json
// @Produce      json
// @Param        template_id path string true "Template ID"
// @Param        build_id path string true "Build ID"
// @Param        request body dto.BuildUpdateRequest true "Build update data"
// @Success      200  {object}  dto.BuildResponse
// @Failure      400  {object}  map[string]string
// @Failure      401  {object}  map[string]string
// @Failure      403  {object}  map[string]string
// @Failure      404  {object}  map[string]string
// @Failure      500  {object}  map[string]string
// @Router       /templates/{template_id}/builds/{build_id} [put]
func UpdateBuildByID(buildService services.BuildServiceInterface) gin.HandlerFunc {
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

		var req dto.BuildUpdateRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
			return
		}
		req.ID = buildID

		requesterID := RequesterID(c)
		if requesterID <= 0 {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
			return
		}

		build, err := buildService.UpdateBuild(c.Request.Context(), requesterID, templateID, &req)
		if err != nil {
			respondError(c, err)
			return
		}
		c.JSON(http.StatusOK, build)
	}
}

// DeleteBuild godoc
// @Summary      Delete a build
// @Description  Deletes a build if the authenticated user is its creator
// @Tags         builds
// @Accept       json
// @Produce      json
// @Param        build_id path string true "Build ID"
// @Success      200  {object}  map[string]string
// @Failure      400  {object}  map[string]string
// @Failure      401  {object}  map[string]string
// @Failure      403  {object}  map[string]string
// @Failure      404  {object}  map[string]string
// @Failure      500  {object}  map[string]string
// @Router       /builds/{build_id} [delete]
func DeleteBuild(buildService services.BuildServiceInterface) gin.HandlerFunc {
	return func(c *gin.Context) {
		buildID := c.Param("build_id")
		if buildID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "build id is required"})
			return
		}

		requesterID := RequesterID(c)
		if requesterID <= 0 {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
			return
		}

		if err := buildService.DeleteBuild(c.Request.Context(), requesterID, buildID); err != nil {
			respondError(c, err)
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "build deleted"})
	}
}

// VoteBuild godoc
// @Summary      Like or dislike a build
// @Description  Records a +1 (like) or -1 (dislike) vote from the authenticated user
// @Tags         builds
// @Accept       json
// @Produce      json
// @Param        build_id path string true "Build ID"
// @Param        request body object{value=int} true "Vote value, 1 or -1"
// @Success      200  {object}  dto.BuildResponse
// @Failure      400  {object}  map[string]string
// @Failure      401  {object}  map[string]string
// @Failure      404  {object}  map[string]string
// @Failure      500  {object}  map[string]string
// @Router       /builds/{build_id}/vote [post]
func VoteBuild(buildService services.BuildServiceInterface) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := RequesterID(c)
		if userID <= 0 {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
			return
		}
		buildID := c.Param("build_id")
		if buildID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "build id is required"})
			return
		}

		var req struct {
			Value int16 `json:"value"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
			return
		}

		build, err := buildService.VoteBuild(c.Request.Context(), userID, buildID, req.Value)
		if err != nil {
			respondError(c, err)
			return
		}
		c.JSON(http.StatusOK, build)
	}
}

// RemoveBuildVote godoc
// @Summary      Remove a vote from a build
// @Description  Removes the authenticated user's vote from a build
// @Tags         builds
// @Produce      json
// @Param        build_id path string true "Build ID"
// @Success      200  {object}  dto.BuildResponse
// @Failure      400  {object}  map[string]string
// @Failure      401  {object}  map[string]string
// @Failure      404  {object}  map[string]string
// @Failure      500  {object}  map[string]string
// @Router       /builds/{build_id}/vote [delete]
func RemoveBuildVote(buildService services.BuildServiceInterface) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := RequesterID(c)
		if userID <= 0 {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
			return
		}
		buildID := c.Param("build_id")
		if buildID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "build id is required"})
			return
		}

		build, err := buildService.RemoveBuildVote(c.Request.Context(), userID, buildID)
		if err != nil {
			respondError(c, err)
			return
		}
		c.JSON(http.StatusOK, build)
	}
}
