package handlers

import (
	"main/apps/api/internal/services"
	"net/http"

	"github.com/gin-gonic/gin"
)

// GetPublicStats godoc
// @Summary      Get platform-wide stats
// @Description  Returns counts of public templates, published builds, and community likes
// @Tags         stats
// @Accept       json
// @Produce      json
// @Success      200  {object}  dto.StatsResponse
// @Failure      500  {object}  map[string]string
// @Router       /stats [get]
func GetPublicStats(statsService services.StatsServiceInterface) gin.HandlerFunc {
	return func(c *gin.Context) {
		stats, err := statsService.GetPublicStats(c.Request.Context())
		if err != nil {
			respondError(c, err)
			return
		}
		c.JSON(http.StatusOK, stats)
	}
}
