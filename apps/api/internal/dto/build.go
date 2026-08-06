package dto

import (
	"encoding/json"
	"main/apps/api/internal/repository"
	"time"
)

type BuildCreateRequest struct {
	Name        string          `json:"name" binding:"required"`
	Description string          `json:"description,omitempty"`
	Tags        []string        `json:"tags,omitempty"`
	Components  json.RawMessage `json:"components" binding:"required"`
	IsPrivate   bool            `json:"is_private"`
}

type BuildUpdateRequest struct {
	ID          string          `json:"id" binding:"required"`
	Name        string          `json:"name" binding:"required"`
	Description string          `json:"description,omitempty"`
	Tags        []string        `json:"tags,omitempty"`
	Components  json.RawMessage `json:"components" binding:"required"`
	IsPrivate   bool            `json:"is_private"`
}

type BuildResponse struct {
	ID            string          `json:"id"`
	Name          string          `json:"name"`
	Description   string          `json:"description,omitempty"`
	CreatorUserID int32           `json:"creator_user_id"`
	TemplateID    string          `json:"template_id"`
	CreatedAt     time.Time       `json:"created_at"`
	UpdatedAt     time.Time       `json:"updated_at"`
	Tags          []string        `json:"tags,omitempty"`
	VoteScore     int32           `json:"vote_score"`
	Components    json.RawMessage `json:"components,omitempty"`
	IsPrivate     bool            `json:"is_private"`
}

func ToBuildResponse(build *repository.Build) *BuildResponse {
	if build == nil {
		return nil
	}

	return &BuildResponse{
		ID:            build.ID,
		Name:          build.Name,
		Description:   build.Description.String,
		CreatorUserID: build.CreatorUserID,
		TemplateID:    build.TemplateID,
		CreatedAt:     build.CreatedAt.Time,
		UpdatedAt:     build.UpdatedAt.Time,
		Tags:          build.Tags,
		VoteScore:     build.VoteScore,
		Components:    json.RawMessage(build.Components),
		IsPrivate:     build.IsPrivate,
	}
}

func ToBuildResponseFromCreate(build *repository.CreateBuildRow) *BuildResponse {
	if build == nil {
		return nil
	}

	return &BuildResponse{
		ID:            build.ID,
		Name:          build.Name,
		Description:   build.Description.String,
		CreatorUserID: build.CreatorUserID,
		TemplateID:    build.TemplateID,
		CreatedAt:     build.CreatedAt.Time,
		UpdatedAt:     build.UpdatedAt.Time,
		Tags:          build.Tags,
		VoteScore:     build.VoteScore,
		Components:    json.RawMessage(build.Components),
		IsPrivate:     build.IsPrivate,
	}
}

func ToBuildResponseFromGet(build *repository.GetBuildByIDRow) *BuildResponse {
	if build == nil {
		return nil
	}

	return &BuildResponse{
		ID:            build.ID,
		Name:          build.Name,
		Description:   build.Description.String,
		CreatorUserID: build.CreatorUserID,
		TemplateID:    build.TemplateID,
		CreatedAt:     build.CreatedAt.Time,
		UpdatedAt:     build.UpdatedAt.Time,
		Tags:          build.Tags,
		VoteScore:     build.VoteScore,
		Components:    json.RawMessage(build.Components),
		IsPrivate:     build.IsPrivate,
	}
}

func ToBuildResponseFromUpdate(build *repository.UpdateBuildRow) *BuildResponse {
	if build == nil {
		return nil
	}

	return &BuildResponse{
		ID:            build.ID,
		Name:          build.Name,
		Description:   build.Description.String,
		CreatorUserID: build.CreatorUserID,
		TemplateID:    build.TemplateID,
		CreatedAt:     build.CreatedAt.Time,
		UpdatedAt:     build.UpdatedAt.Time,
		Tags:          build.Tags,
		VoteScore:     build.VoteScore,
		Components:    json.RawMessage(build.Components),
		IsPrivate:     build.IsPrivate,
	}
}

func ToBuildResponses(builds []repository.Build) []*BuildResponse {
	result := make([]*BuildResponse, 0, len(builds))
	for i := range builds {
		result = append(result, ToBuildResponse(&builds[i]))
	}
	return result
}

func ToBuildResponsesFromListByUser(builds []repository.ListBuildsByUserRow) []*BuildResponse {
	result := make([]*BuildResponse, 0, len(builds))
	for i := range builds {
		b := builds[i]
		result = append(result, &BuildResponse{
			ID:            b.ID,
			Name:          b.Name,
			Description:   b.Description.String,
			CreatorUserID: b.CreatorUserID,
			TemplateID:    b.TemplateID,
			CreatedAt:     b.CreatedAt.Time,
			UpdatedAt:     b.UpdatedAt.Time,
			Tags:          b.Tags,
			VoteScore:     b.VoteScore,
			Components:    json.RawMessage(b.Components),
			IsPrivate:     b.IsPrivate,
		})
	}
	return result
}

func ToBuildResponsesFromListByTemplate(builds []repository.ListBuildsByTemplateRow) []*BuildResponse {
	result := make([]*BuildResponse, len(builds))
	for i := range builds {
		b := builds[i]
		result = append(result, &BuildResponse{
			ID:            b.ID,
			Name:          b.Name,
			Description:   b.Description.String,
			CreatorUserID: b.CreatorUserID,
			TemplateID:    b.TemplateID,
			CreatedAt:     b.CreatedAt.Time,
			UpdatedAt:     b.UpdatedAt.Time,
			Tags:          b.Tags,
			VoteScore:     b.VoteScore,
			Components:    json.RawMessage(b.Components),
			IsPrivate:     b.IsPrivate,
		})
	}
	return result
}
