package dto

import (
	"encoding/json"
	"main/apps/api/internal/repository"
	"time"
)

type TemplateCreateRequest struct {
	Name          string                 `json:"name" binding:"required"`
	Description   *string                `json:"description"`
	CreatorUserID int32                  `json:"creator_user_id" binding:"required,gt=0"`
	Rules         json.RawMessage        `json:"rules" binding:"required"`
	IsPrivate     bool                   `json:"is_private"`
	Stats         json.RawMessage        `json:"stats"`
	Components    []ComponentCreateInput `json:"components" binding:"required,min=1"`
}

type TemplateUpdateRequest struct {
	ID          string                  `json:"id"`
	Name        string                  `json:"name" binding:"required"`
	Description *string                 `json:"description"`
	IsPrivate   *bool                   `json:"is_private"`
	Stats       json.RawMessage         `json:"stats"`
	Rules       json.RawMessage         `json:"rules" binding:"required"`
	Components  []ComponentCreateInput  `json:"components"`
}

type TemplateResponse struct {
	ID              string                 `json:"id"`
	Name            string                 `json:"name"`
	Description     *string                `json:"description,omitempty"`
	CreatorUserID   int32                  `json:"creator_user_id"`
	CreatorUsername *string                `json:"creator_username,omitempty"`
	IsPrivate       bool                   `json:"is_private"`
	CreatedAt       time.Time              `json:"created_at"`
	UpdatedAt       time.Time              `json:"updated_at"`
	Rules           json.RawMessage        `json:"rules,omitempty"`
	Stats           json.RawMessage        `json:"stats,omitempty"`
	Components      []ComponentCreateInput `json:"components,omitempty"` // Added Components
}

// Universal mapper for repository.Template models (reused for create/update/get results)
// Note: Adjust the parameter or how components are fetched/passed depending on your repository structure.
func ToTemplateResponse(template *repository.Template, components []ComponentCreateInput) *TemplateResponse {
	if template == nil {
		return nil
	}

	var desc *string
	if template.Description.Valid {
		desc = &template.Description.String
	}

	return &TemplateResponse{
		ID:            template.ID,
		Name:          template.Name,
		Description:   desc,
		CreatorUserID: template.CreatorUserID,
		IsPrivate:     template.IsPrivate,
		CreatedAt:     template.CreatedAt.Time,
		UpdatedAt:     template.UpdatedAt.Time,
		Rules:         json.RawMessage(template.Rules),
		Components:    components,
	}
}

type ComponentCreateInput struct {
	ScopedNumber int             `json:"scoped_number" binding:"required,gt=0"`
	Name         string          `json:"name" binding:"required"`
	Description  *string         `json:"description"`
	SubCategory  *string         `json:"sub_category"`
	Category     string          `json:"category" binding:"required"`
	Effects      json.RawMessage `json:"effects" binding:"required"`
	HasLevels    bool            `json:"has_levels"`
	LevelScaling *string         `json:"level_scaling"`
	LevelRule    json.RawMessage `json:"level_rule"`
	Tiers        json.RawMessage `json:"tiers"`
}

func ToTemplateResponseFromListRow(row *repository.Template, creatorUsername *string) *TemplateResponse {
	if row == nil {
		return nil
	}

	var desc *string
	if row.Description.Valid {
		desc = &row.Description.String
	}

	return &TemplateResponse{
		ID:              row.ID,
		Name:            row.Name,
		Description:     desc,
		CreatorUserID:   row.CreatorUserID,
		CreatorUsername: creatorUsername,
		IsPrivate:       row.IsPrivate,
		CreatedAt:       row.CreatedAt.Time,
		UpdatedAt:       row.UpdatedAt.Time,
		Rules:           json.RawMessage(row.Rules),
		Stats:           json.RawMessage(row.Stats),
	}
}

func ToTemplateResponsesFromListRows(rows []repository.Template, usernames map[int32]string) []*TemplateResponse {
	result := make([]*TemplateResponse, 0, len(rows))
	for i := range rows {
		var uname *string
		if u, ok := usernames[rows[i].CreatorUserID]; ok {
			uname = &u
		}
		result = append(result, ToTemplateResponseFromListRow(&rows[i], uname))
	}
	return result
}
