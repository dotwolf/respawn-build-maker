package handlers

import (
	"main/apps/api/internal/dto"
	"main/apps/api/internal/services"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

// CreateSuggestion godoc
// @Summary      Create or update a public inventory suggestion
// @Description  Submits a pending suggestion for a template. A user can only
// @Description  have one pending suggestion per template; resubmitting overwrites it.
// @Tags         suggestions
// @Accept       json
// @Produce      json
// @Param        template_id path string true "Template ID"
// @Param        request body dto.SuggestionCreateRequest true "Suggestion data"
// @Success      201  {object}  dto.SuggestionResponse
// @Failure      400  {object}  map[string]string
// @Failure      404  {object}  map[string]string
// @Failure      500  {object}  map[string]string
// @Router       /templates/{template_id}/suggestions [post]
func CreateSuggestion(suggestionService services.SuggestionServiceInterface) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req dto.SuggestionCreateRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body: " + err.Error()})
			return
		}

		suggestion, err := suggestionService.CreateSuggestion(c.Request.Context(), RequesterID(c), c.Param("template_id"), &req)
		if err != nil {
			respondError(c, err)
			return
		}
		c.JSON(http.StatusCreated, suggestion)
	}
}

// ListSuggestionsByTemplate godoc
// @Summary      List pending suggestions for a template
// @Description  Returns the pending public inventory suggestions for a template the requester owns.
// @Tags         suggestions
// @Accept       json
// @Produce      json
// @Param        template_id path string true "Template ID"
// @Param        limit query int false "Page size"
// @Param        offset query int false "Page offset"
// @Success      200  {array}   dto.SuggestionResponse
// @Failure      400  {object}  map[string]string
// @Failure      404  {object}  map[string]string
// @Failure      500  {object}  map[string]string
// @Router       /templates/{template_id}/suggestions [get]
func ListSuggestionsByTemplate(suggestionService services.SuggestionServiceInterface) gin.HandlerFunc {
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

		suggestions, err := suggestionService.ListSuggestionsByTemplate(c.Request.Context(), c.Param("template_id"), RequesterID(c), int32(limit), int32(offset))
		if err != nil {
			respondError(c, err)
			return
		}
		c.JSON(http.StatusOK, suggestions)
	}
}

// AcceptSuggestion godoc
// @Summary      Accept a suggestion
// @Description  Applies the suggestion's components to the template's inventory pool
// @Description  and notifies the author that the suggestion was accepted.
// @Tags         suggestions
// @Accept       json
// @Produce      json
// @Param        template_id path string true "Template ID"
// @Param        suggestion_id path string true "Suggestion ID"
// @Success      200  {object}  dto.SuggestionResponse
// @Failure      400  {object}  map[string]string
// @Failure      404  {object}  map[string]string
// @Failure      500  {object}  map[string]string
// @Router       /templates/{template_id}/suggestions/{suggestion_id}/accept [post]
func AcceptSuggestion(suggestionService services.SuggestionServiceInterface) gin.HandlerFunc {
	return func(c *gin.Context) {
		suggestion, err := suggestionService.AcceptSuggestion(c.Request.Context(), RequesterID(c), c.Param("template_id"), c.Param("suggestion_id"))
		if err != nil {
			respondError(c, err)
			return
		}
		c.JSON(http.StatusOK, suggestion)
	}
}

// DeleteSuggestion godoc
// @Summary      Delete a suggestion
// @Description  Removes a suggestion. The template owner or the suggestion author may delete it.
// @Tags         suggestions
// @Produce      json
// @Param        template_id path string true "Template ID"
// @Param        suggestion_id path string true "Suggestion ID"
// @Success      204  {object}  map[string]string
// @Failure      400  {object}  map[string]string
// @Failure      404  {object}  map[string]string
// @Failure      500  {object}  map[string]string
// @Router       /templates/{template_id}/suggestions/{suggestion_id} [delete]
func DeleteSuggestion(suggestionService services.SuggestionServiceInterface) gin.HandlerFunc {
	return func(c *gin.Context) {
		err := suggestionService.DeleteSuggestion(c.Request.Context(), RequesterID(c), c.Param("template_id"), c.Param("suggestion_id"))
		if err != nil {
			respondError(c, err)
			return
		}
		c.Status(http.StatusNoContent)
	}
}

// CountPendingSuggestions godoc
// @Summary      Count pending suggestions for the requester's templates
// @Description  Returns how many public inventory suggestions are awaiting review
// @Description  across all templates owned by the authenticated user.
// @Tags         suggestions
// @Produce      json
// @Success      200  {object}  map[string]int64
// @Failure      500  {object}  map[string]string
// @Router       /me/suggestions/count [get]
func CountPendingSuggestions(suggestionService services.SuggestionServiceInterface) gin.HandlerFunc {
	return func(c *gin.Context) {
		count, err := suggestionService.CountPendingSuggestionsForOwner(c.Request.Context(), RequesterID(c))
		if err != nil {
			respondError(c, err)
			return
		}
		c.JSON(http.StatusOK, gin.H{"count": count})
	}
}

// GetSuggestionNotifications godoc
// @Summary      Get accepted-suggestion notifications
// @Description  Returns the templates for which the authenticated user's suggestions
// @Description  were accepted, then marks those notifications as delivered.
// @Tags         suggestions
// @Produce      json
// @Success      200  {array}   dto.SuggestionNotificationResponse
// @Failure      500  {object}  map[string]string
// @Router       /me/suggestion-notifications [get]
func GetSuggestionNotifications(suggestionService services.SuggestionServiceInterface) gin.HandlerFunc {
	return func(c *gin.Context) {
		notifications, err := suggestionService.GetNotifications(c.Request.Context(), RequesterID(c))
		if err != nil {
			respondError(c, err)
			return
		}
		c.JSON(http.StatusOK, notifications)
	}
}

// CountUnreadSuggestionNotifications godoc
// @Summary      Count unread accepted-suggestion notifications
// @Description  Returns how many of the authenticated user's suggestions were
// @Description  accepted but have not been acknowledged yet. Does not mark them as read.
// @Tags         suggestions
// @Produce      json
// @Success      200  {object}  map[string]int64
// @Failure      500  {object}  map[string]string
// @Router       /me/suggestion-notifications/count [get]
func CountUnreadSuggestionNotifications(suggestionService services.SuggestionServiceInterface) gin.HandlerFunc {
	return func(c *gin.Context) {
		count, err := suggestionService.CountUnreadAcceptedSuggestionsForAuthor(c.Request.Context(), RequesterID(c))
		if err != nil {
			respondError(c, err)
			return
		}
		c.JSON(http.StatusOK, gin.H{"count": count})
	}
}

// ListPendingSuggestionNotifications godoc
// @Summary      List pending suggestions per owned template
// @Description  Returns each of the authenticated user's templates with the
// @Description  number of suggestions awaiting review.
// @Tags         suggestions
// @Produce      json
// @Success      200  {array}   dto.PendingSuggestionNotificationResponse
// @Failure      500  {object}  map[string]string
// @Router       /me/suggestions/pending [get]
func ListPendingSuggestionNotifications(suggestionService services.SuggestionServiceInterface) gin.HandlerFunc {
	return func(c *gin.Context) {
		notifications, err := suggestionService.ListPendingSuggestionNotificationsForOwner(c.Request.Context(), RequesterID(c))
		if err != nil {
			respondError(c, err)
			return
		}
		c.JSON(http.StatusOK, notifications)
	}
}
