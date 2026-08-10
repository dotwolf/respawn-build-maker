package dto

import (
	"encoding/json"
	"main/apps/api/internal/repository"
	"time"
)

// SuggestionCreateRequest carries the difference between the template's current
// component pool and the pool the author is proposing.
type SuggestionCreateRequest struct {
	Description *string                `json:"description"`
	Added       []ComponentCreateInput `json:"added"`
	Edited      []ComponentCreateInput `json:"edited"`
	Removed     []int32                `json:"removed"`
}

// SuggestionChangeSet is the persisted representation of a suggestion's diff.
// Added components carry the scoped_number they propose (used for display only;
// accept reassigns fresh numbers to avoid collisions).
type SuggestionChangeSet struct {
	Added   []ComponentCreateInput `json:"added"`
	Edited  []ComponentCreateInput `json:"edited"`
	Removed []int32                `json:"removed"`
}

type SuggestionResponse struct {
	ID           string                 `json:"id"`
	TemplateID   string                 `json:"template_id"`
	AuthorUserID int32                  `json:"author_user_id"`
	AuthorName   string                 `json:"author_name,omitempty"`
	Description  *string                `json:"description,omitempty"`
	Added        []ComponentCreateInput `json:"added,omitempty"`
	Edited       []ComponentCreateInput `json:"edited,omitempty"`
	Removed      []int32                `json:"removed,omitempty"`
	Status       string                 `json:"status"`
	CreatedAt    time.Time              `json:"created_at"`
	UpdatedAt    time.Time              `json:"updated_at"`
}

type SuggestionNotificationResponse struct {
	TemplateID string `json:"template_id"`
	TemplateName string `json:"template_name"`
}

type PendingSuggestionNotificationResponse struct {
	TemplateID   string `json:"template_id"`
	TemplateName string `json:"template_name"`
	PendingCount int64  `json:"pending_count"`
}

func ToSuggestionResponse(suggestion *repository.TemplateSuggestion, changeSet *SuggestionChangeSet, authorName string) *SuggestionResponse {
	if suggestion == nil {
		return nil
	}

	var desc *string
	if suggestion.Description.Valid {
		desc = &suggestion.Description.String
	}

	return &SuggestionResponse{
		ID:           suggestion.ID,
		TemplateID:   suggestion.TemplateID,
		AuthorUserID: suggestion.AuthorUserID,
		AuthorName:   authorName,
		Description:  desc,
		Added:        changeSet.Added,
		Edited:       changeSet.Edited,
		Removed:      changeSet.Removed,
		Status:       suggestion.Status,
		CreatedAt:    suggestion.CreatedAt.Time,
		UpdatedAt:    suggestion.UpdatedAt.Time,
	}
}

func SuggestionChangeSetFromRow(suggestion *repository.TemplateSuggestion) *SuggestionChangeSet {
	result := &SuggestionChangeSet{
		Added:   []ComponentCreateInput{},
		Edited:  []ComponentCreateInput{},
		Removed: []int32{},
	}
	if suggestion == nil {
		return result
	}
	_ = json.Unmarshal(suggestion.Components, result)
	if result.Added == nil {
		result.Added = []ComponentCreateInput{}
	}
	if result.Edited == nil {
		result.Edited = []ComponentCreateInput{}
	}
	if result.Removed == nil {
		result.Removed = []int32{}
	}
	return result
}
