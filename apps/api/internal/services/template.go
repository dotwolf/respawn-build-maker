package services

import (
	"context"
	"fmt"
	"strings"
	"time"

	"main/apps/api/internal/dto"
	"main/apps/api/internal/repository"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

type TemplateService struct {
	queries *repository.Queries
}

func NewTemplateService(pool *pgxpool.Pool) *TemplateService {
	return &TemplateService{queries: repository.New(pool)}
}

func (s *TemplateService) CreateTemplate(ctx context.Context, req *dto.TemplateCreateRequest) (*dto.TemplateResponse, error) {
	if req == nil {
		return nil, fmt.Errorf("request is required")
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return nil, fmt.Errorf("template name is required")
	}
	if req.CreatorUserID <= 0 {
		return nil, fmt.Errorf("creator user id is required")
	}

	now := time.Now()
	templateID := fmt.Sprintf("tmpl-%d", now.UnixNano())

	template, err := s.queries.CreateTemplate(ctx, repository.CreateTemplateParams{
		ID:            templateID,
		Name:          name,
		CreatorUserID: req.CreatorUserID,
		CreatedAt:     pgtype.Timestamptz{Time: now, Valid: true},
		UpdatedAt:     pgtype.Timestamptz{Time: now, Valid: true},
		Rules:         []byte(req.Rules),
		ComponentPool: []byte(req.ComponentPool),
	})
	if err != nil {
		return nil, err
	}

	return dto.ToTemplateResponse(&template), nil
}

func (s *TemplateService) GetTemplateByID(ctx context.Context, id string) (*dto.TemplateResponse, error) {
	if strings.TrimSpace(id) == "" {
		return nil, fmt.Errorf("template id is required")
	}

	template, err := s.queries.GetTemplateByID(ctx, id)
	if err != nil {
		return nil, err
	}
	return dto.ToTemplateResponse(&template), nil
}

func (s *TemplateService) ListTemplatesByUser(ctx context.Context, creatorUserID int32, limit int32, offset int32) ([]*dto.TemplateResponse, error) {
	if creatorUserID <= 0 {
		return nil, fmt.Errorf("creator user id is required")
	}
	if limit <= 0 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}

	templates, err := s.queries.ListTemplatesByUser(ctx, repository.ListTemplatesByUserParams{
		CreatorUserID: creatorUserID,
		Limit:         limit,
		Offset:        offset,
	})
	if err != nil {
		return nil, err
	}

	return dto.ToTemplateResponses(templates), nil
}

func (s *TemplateService) UpdateTemplate(ctx context.Context, req *dto.TemplateUpdateRequest) (*dto.TemplateResponse, error) {
	if req == nil {
		return nil, fmt.Errorf("request is required")
	}
	if strings.TrimSpace(req.ID) == "" {
		return nil, fmt.Errorf("template id is required")
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return nil, fmt.Errorf("template name is required")
	}

	now := time.Now()
	template, err := s.queries.UpdateTemplate(ctx, repository.UpdateTemplateParams{
		ID:            req.ID,
		Name:          name,
		UpdatedAt:     pgtype.Timestamptz{Time: now, Valid: true},
		Rules:         []byte(req.Rules),
		ComponentPool: []byte(req.ComponentPool),
	})
	if err != nil {
		return nil, err
	}

	return dto.ToTemplateResponse(&template), nil
}

func (s *TemplateService) DeleteTemplate(ctx context.Context, id string) error {
	if strings.TrimSpace(id) == "" {
		return fmt.Errorf("template id is required")
	}
	return s.queries.DeleteTemplate(ctx, id)
}

func (s *TemplateService) CreateComponent(ctx context.Context, templateID string, name string, category string, effects []byte, hasLevels bool, levelScaling *string, levelRule []byte, isDeleted bool) (*repository.CreateComponentRow, error) {
	if strings.TrimSpace(templateID) == "" {
		return nil, fmt.Errorf("template id is required")
	}
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, fmt.Errorf("component name is required")
	}
	category = strings.TrimSpace(category)
	if category == "" {
		return nil, fmt.Errorf("component category is required")
	}

	now := time.Now()
	var levelScalingValue pgtype.Text
	if levelScaling != nil {
		levelScalingValue = pgtype.Text{String: *levelScaling, Valid: true}
	}

	component, err := s.queries.CreateComponent(ctx, repository.CreateComponentParams{
		ID:           time.Now().UnixNano(),
		TemplateID:   templateID,
		Name:         name,
		Category:     category,
		Effects:      effects,
		HasLevels:    hasLevels,
		LevelScaling: levelScalingValue,
		LevelRule:    levelRule,
		IsDeleted:    isDeleted,
		CreatedAt:    pgtype.Timestamptz{Time: now, Valid: true},
		UpdatedAt:    pgtype.Timestamptz{Time: now, Valid: true},
	})
	if err != nil {
		return nil, err
	}

	return &component, nil
}

func (s *TemplateService) GetComponentByID(ctx context.Context, templateID string, componentID int64) (*repository.GetComponentByIDRow, error) {
	if strings.TrimSpace(templateID) == "" {
		return nil, fmt.Errorf("template id is required")
	}
	if componentID <= 0 {
		return nil, fmt.Errorf("component id is required")
	}

	component, err := s.queries.GetComponentByID(ctx, repository.GetComponentByIDParams{ID: componentID, TemplateID: templateID})
	if err != nil {
		return nil, err
	}
	return &component, nil
}

func (s *TemplateService) ListComponentsByTemplate(ctx context.Context, templateID string, limit int32, offset int32) ([]*repository.GetComponentByIDRow, error) {
	if strings.TrimSpace(templateID) == "" {
		return nil, fmt.Errorf("template id is required")
	}
	if limit <= 0 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}

	components, err := s.queries.ListComponentsByTemplate(ctx, repository.ListComponentsByTemplateParams{TemplateID: templateID, Limit: limit, Offset: offset})
	if err != nil {
		return nil, err
	}

	result := make([]*repository.GetComponentByIDRow, 0, len(components))
	for i := range components {
		c := components[i]
		result = append(result, &repository.GetComponentByIDRow{
			ID:           c.ID,
			TemplateID:   c.TemplateID,
			Name:         c.Name,
			Category:     c.Category,
			Effects:      c.Effects,
			HasLevels:    c.HasLevels,
			LevelScaling: c.LevelScaling,
			LevelRule:    c.LevelRule,
			IsDeleted:    c.IsDeleted,
			CreatedAt:    c.CreatedAt,
			UpdatedAt:    c.UpdatedAt,
		})
	}
	return result, nil
}

func (s *TemplateService) UpdateComponent(ctx context.Context, templateID string, componentID int64, name string, category string, effects []byte, hasLevels bool, levelScaling *string, levelRule []byte, isDeleted bool) (*repository.UpdateComponentRow, error) {
	if strings.TrimSpace(templateID) == "" {
		return nil, fmt.Errorf("template id is required")
	}
	if componentID <= 0 {
		return nil, fmt.Errorf("component id is required")
	}
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, fmt.Errorf("component name is required")
	}
	category = strings.TrimSpace(category)
	if category == "" {
		return nil, fmt.Errorf("component category is required")
	}

	now := time.Now()
	var levelScalingValue pgtype.Text
	if levelScaling != nil {
		levelScalingValue = pgtype.Text{String: *levelScaling, Valid: true}
	}

	component, err := s.queries.UpdateComponent(ctx, repository.UpdateComponentParams{
		Name:         name,
		Category:     category,
		Effects:      effects,
		HasLevels:    hasLevels,
		LevelScaling: levelScalingValue,
		LevelRule:    levelRule,
		IsDeleted:    isDeleted,
		UpdatedAt:    pgtype.Timestamptz{Time: now, Valid: true},
		ID:           componentID,
		TemplateID:   templateID,
	})
	if err != nil {
		return nil, err
	}

	return &component, nil
}

func (s *TemplateService) DeleteComponent(ctx context.Context, templateID string, componentID int64) error {
	if strings.TrimSpace(templateID) == "" {
		return fmt.Errorf("template id is required")
	}
	if componentID <= 0 {
		return fmt.Errorf("component id is required")
	}
	return s.queries.DeleteComponent(ctx, repository.DeleteComponentParams{ID: componentID, TemplateID: templateID})
}
