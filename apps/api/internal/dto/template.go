package dto

import (
	"encoding/json"
	"main/apps/api/internal/repository"
	"time"
)

type TemplateCreateRequest struct {
	Name          string          `json:"name" binding:"required"`
	CreatorUserID int32           `json:"creator_user_id" binding:"required,gt=0"`
	Rules         json.RawMessage `json:"rules" binding:"required"`
}

type TemplateUpdateRequest struct {
	ID    string          `json:"id" binding:"required"`
	Name  string          `json:"name" binding:"required"`
	Rules json.RawMessage `json:"rules" binding:"required"`
}

type TemplateResponse struct {
	ID            string          `json:"id"`
	Name          string          `json:"name"`
	CreatorUserID int32           `json:"creator_user_id"`
	CreatedAt     time.Time       `json:"created_at"`
	UpdatedAt     time.Time       `json:"updated_at"`
	Rules         json.RawMessage `json:"rules,omitempty"`
}

func ToTemplateResponse(template *repository.Template) *TemplateResponse {
	if template == nil {
		return nil
	}

	return &TemplateResponse{
		ID:            template.ID,
		Name:          template.Name,
		CreatorUserID: template.CreatorUserID,
		CreatedAt:     template.CreatedAt.Time,
		UpdatedAt:     template.UpdatedAt.Time,
		Rules:         json.RawMessage(template.Rules),
	}
}

func ToTemplateResponses(templates []repository.Template) []*TemplateResponse {
	result := make([]*TemplateResponse, 0, len(templates))
	for i := range templates {
		result = append(result, ToTemplateResponse(&templates[i]))
	}
	return result
}
