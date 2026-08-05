package services

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"main/apps/api/internal/dto"
	"main/apps/api/internal/repository"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

type TemplateService struct {
	pool    *pgxpool.Pool
	queries *repository.Queries
}

func NewTemplateService(pool *pgxpool.Pool) *TemplateService {
	return &TemplateService{
		pool:    pool,
		queries: repository.New(pool),
	}
}

// CreateTemplateWithComponents wraps template and component creation in a single transaction
func (s *TemplateService) CreateTemplateWithComponents(ctx context.Context, req *dto.TemplateCreateRequest) (*dto.TemplateResponse, error) {
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
	if len(req.Components) == 0 {
		return nil, fmt.Errorf("at least one component is required")
	}

	// 1. Begin Database Transaction using s.pool
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	// Bind sqlc queries to the active transaction context
	qtx := s.queries.WithTx(tx)

	now := time.Now()
	templateID := fmt.Sprintf("tmpl-%d", now.UnixNano())

	var descValue pgtype.Text
	if req.Description != nil {
		descValue = pgtype.Text{String: *req.Description, Valid: true}
	}

	statsValue := []byte(req.Stats)
	if len(statsValue) == 0 {
		statsValue = []byte("[]")
	}

	// 2. Create Template within Transaction
	template, err := qtx.CreateTemplate(ctx, repository.CreateTemplateParams{
		ID:            templateID,
		Name:          name,
		Description:   descValue,
		CreatorUserID: req.CreatorUserID,
		Stats:         statsValue,
		Rules:         []byte(req.Rules),
		Components:    []byte("[]"),
		IsPrivate:     req.IsPrivate,
		CreatedAt:     pgtype.Timestamptz{Time: now, Valid: true},
		UpdatedAt:     pgtype.Timestamptz{Time: now, Valid: true},
	})
	if err != nil {
		return nil, fmt.Errorf("failed to create template: %w", err)
	}

	// 3. Create Components within Transaction
	createdComponents := make([]dto.ComponentCreateInput, 0, len(req.Components))
	for _, comp := range req.Components {
		compName := strings.TrimSpace(comp.Name)
		if compName == "" {
			return nil, fmt.Errorf("component name is required")
		}
		compCategory := strings.TrimSpace(comp.Category)
		if compCategory == "" {
			return nil, fmt.Errorf("component category is required")
		}

		var levelScalingValue pgtype.Text
		if comp.LevelScaling != nil {
			levelScalingValue = pgtype.Text{String: *comp.LevelScaling, Valid: true}
		}

		var compDescValue pgtype.Text
		if comp.Description != nil {
			compDescValue = pgtype.Text{String: *comp.Description, Valid: true}
		}

		var compSubCategoryValue pgtype.Text
		if comp.SubCategory != nil {
			compSubCategoryValue = pgtype.Text{String: *comp.SubCategory, Valid: true}
		}

		tiersValue := []byte(comp.Tiers)
		if len(tiersValue) == 0 {
			tiersValue = []byte("[]")
		}

		_, err := qtx.CreateComponent(ctx, repository.CreateComponentParams{
			TemplateID:   templateID,
			ScopedNumber: int32(comp.ScopedNumber),
			Name:         compName,
			Description:  compDescValue,
			SubCategory:  compSubCategoryValue,
			Category:     compCategory,
			Effects:      []byte(comp.Effects),
			HasLevels:    comp.HasLevels,
			LevelScaling: levelScalingValue,
			LevelRule:    []byte(comp.LevelRule),
			Tiers:        tiersValue,
			IsDeleted:    false,
			CreatedAt:    pgtype.Timestamptz{Time: now, Valid: true},
			UpdatedAt:    pgtype.Timestamptz{Time: now, Valid: true},
		})
		if err != nil {
			return nil, fmt.Errorf("failed to create component '%s': %w", compName, err)
		}

		createdComponents = append(createdComponents, comp)
	}

	// 4. Commit Transaction
	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("failed to commit transaction: %w", err)
	}

	return dto.ToTemplateResponse(&template, createdComponents), nil
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
		Stats:         []byte("[]"),
		Components:    []byte("[]"),
		CreatedAt:     pgtype.Timestamptz{Time: now, Valid: true},
		UpdatedAt:     pgtype.Timestamptz{Time: now, Valid: true},
		Rules:         []byte(req.Rules),
	})
	if err != nil {
		return nil, err
	}

	return dto.ToTemplateResponse(&template, nil), nil
}

func (s *TemplateService) GetTemplateByID(ctx context.Context, id string) (*dto.TemplateResponse, error) {
	if strings.TrimSpace(id) == "" {
		return nil, fmt.Errorf("template id is required")
	}

	template, err := s.queries.GetTemplateByID(ctx, id)
	if err != nil {
		return nil, err
	}

	// Fetch associated components for full view
	dbComponents, err := s.queries.ListComponentsByTemplate(ctx, repository.ListComponentsByTemplateParams{
		TemplateID: id,
		Limit:      100,
		Offset:     0,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to fetch template components: %w", err)
	}

	components := make([]dto.ComponentCreateInput, 0, len(dbComponents))
	for _, c := range dbComponents {
		var desc *string
		if c.Description.Valid {
			desc = &c.Description.String
		}

		var scaling *string
		if c.LevelScaling.Valid {
			scaling = &c.LevelScaling.String
		}

		var subCategory *string
		if c.SubCategory.Valid {
			subCategory = &c.SubCategory.String
		}

		components = append(components, dto.ComponentCreateInput{
			ScopedNumber: int(c.ScopedNumber),
			Name:         c.Name,
			Description:  desc,
			SubCategory:  subCategory,
			Category:     c.Category,
			Effects:      json.RawMessage(c.Effects),
			HasLevels:    c.HasLevels,
			LevelScaling: scaling,
			LevelRule:    json.RawMessage(c.LevelRule),
			Tiers:        json.RawMessage(c.Tiers),
		})
	}

	return dto.ToTemplateResponse(&template, components), nil
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

	usernames, err := s.usernamesByIDs(ctx, templates)
	if err != nil {
		return nil, err
	}

	return dto.ToTemplateResponsesFromListRows(templates, usernames), nil
}

func (s *TemplateService) usernamesByIDs(ctx context.Context, templates []repository.Template) (map[int32]string, error) {
	result := make(map[int32]string, len(templates))

	uniqueIDs := make([]int32, 0, len(templates))
	seen := make(map[int32]struct{}, len(templates))
	for _, t := range templates {
		if _, ok := seen[t.CreatorUserID]; ok {
			continue
		}
		seen[t.CreatorUserID] = struct{}{}
		uniqueIDs = append(uniqueIDs, t.CreatorUserID)
	}

	if len(uniqueIDs) == 0 {
		return result, nil
	}

	users, err := s.queries.GetUsersByIDs(ctx, uniqueIDs)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch template creators: %w", err)
	}

	for _, u := range users {
		result[u.ID] = u.Username
	}

	return result, nil
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

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	qtx := s.queries.WithTx(tx)

	now := time.Now()

	var descValue pgtype.Text
	if req.Description != nil {
		descValue = pgtype.Text{String: *req.Description, Valid: true}
	}

	statsValue := []byte(req.Stats)
	if len(statsValue) == 0 {
		statsValue = []byte("[]")
	}

	isPrivate := false
	if req.IsPrivate != nil {
		isPrivate = *req.IsPrivate
	}

	template, err := qtx.UpdateTemplate(ctx, repository.UpdateTemplateParams{
		ID:          req.ID,
		Name:        name,
		Description: descValue,
		Stats:       statsValue,
		Rules:       []byte(req.Rules),
		IsPrivate:   isPrivate,
		UpdatedAt:   pgtype.Timestamptz{Time: now, Valid: true},
	})
	if err != nil {
		return nil, err
	}

	// Replace the component pool: upsert every submitted component keyed by
	// scoped_number, then delete any stored components not present in the payload.
	updatedComponents := make([]dto.ComponentCreateInput, 0, len(req.Components))
	scopedNumbers := make([]int32, 0, len(req.Components))
	for _, comp := range req.Components {
		compName := strings.TrimSpace(comp.Name)
		if compName == "" {
			return nil, fmt.Errorf("component name is required")
		}
		compCategory := strings.TrimSpace(comp.Category)
		if compCategory == "" {
			return nil, fmt.Errorf("component category is required")
		}

		var levelScalingValue pgtype.Text
		if comp.LevelScaling != nil {
			levelScalingValue = pgtype.Text{String: *comp.LevelScaling, Valid: true}
		}

		var compDescValue pgtype.Text
		if comp.Description != nil {
			compDescValue = pgtype.Text{String: *comp.Description, Valid: true}
		}

		var compSubCategoryValue pgtype.Text
		if comp.SubCategory != nil {
			compSubCategoryValue = pgtype.Text{String: *comp.SubCategory, Valid: true}
		}

		tiersValue := []byte(comp.Tiers)
		if len(tiersValue) == 0 {
			tiersValue = []byte("[]")
		}

		if _, err := qtx.UpsertComponent(ctx, repository.UpsertComponentParams{
			TemplateID:   req.ID,
			ScopedNumber: int32(comp.ScopedNumber),
			Name:         compName,
			Description:  compDescValue,
			SubCategory:  compSubCategoryValue,
			Category:     compCategory,
			Effects:      []byte(comp.Effects),
			HasLevels:    comp.HasLevels,
			LevelScaling: levelScalingValue,
			LevelRule:    []byte(comp.LevelRule),
			Tiers:        tiersValue,
			IsDeleted:    false,
			CreatedAt:    pgtype.Timestamptz{Time: now, Valid: true},
			UpdatedAt:    pgtype.Timestamptz{Time: now, Valid: true},
		}); err != nil {
			return nil, fmt.Errorf("failed to upsert component '%s': %w", compName, err)
		}

		scopedNumbers = append(scopedNumbers, int32(comp.ScopedNumber))
		updatedComponents = append(updatedComponents, comp)
	}

	if err := qtx.DeleteComponentsByScopedNumbers(ctx, repository.DeleteComponentsByScopedNumbersParams{
		TemplateID:   req.ID,
		ScopedNumbers: scopedNumbers,
	}); err != nil {
		return nil, fmt.Errorf("failed to remove stale components: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("failed to commit transaction: %w", err)
	}

	return dto.ToTemplateResponse(&template, updatedComponents), nil
}

func (s *TemplateService) DeleteTemplate(ctx context.Context, id string) error {
	if strings.TrimSpace(id) == "" {
		return fmt.Errorf("template id is required")
	}
	return s.queries.DeleteTemplate(ctx, id)
}

func (s *TemplateService) CreateComponent(ctx context.Context, templateID string, name string, category string, effects []byte, hasLevels bool, levelScaling *string, levelRule []byte, isDeleted bool) (*repository.Component, error) {
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

func (s *TemplateService) GetComponentByID(ctx context.Context, templateID string, componentID int64) (*repository.Component, error) {
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

func (s *TemplateService) ListComponentsByTemplate(ctx context.Context, templateID string, limit int32, offset int32) ([]*repository.Component, error) {
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

	result := make([]*repository.Component, 0, len(components))
	for i := range components {
		c := components[i]
		result = append(result, &repository.Component{
			ID:           c.ID,
			TemplateID:   c.TemplateID,
			ScopedNumber: c.ScopedNumber,
			Name:         c.Name,
			Description:  c.Description,
			Category:     c.Category,
			Effects:      c.Effects,
			HasLevels:    c.HasLevels,
			LevelScaling: c.LevelScaling,
			LevelRule:    c.LevelRule,
			Tiers:        c.Tiers,
			IsDeleted:    c.IsDeleted,
			CreatedAt:    c.CreatedAt,
			UpdatedAt:    c.UpdatedAt,
		})
	}
	return result, nil
}

func (s *TemplateService) UpdateComponent(ctx context.Context, templateID string, componentID int64, name string, category string, effects []byte, hasLevels bool, levelScaling *string, levelRule []byte, isDeleted bool) (*repository.Component, error) {
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

func (s *TemplateService) ListPublicTemplates(ctx context.Context, limit int32, offset int32) ([]*dto.TemplateResponse, error) {
	if limit <= 0 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}

	templates, err := s.queries.ListPublicTemplates(ctx, repository.ListPublicTemplatesParams{
		Limit:  limit,
		Offset: offset,
	})
	if err != nil {
		return nil, err
	}

	usernames, err := s.usernamesByIDs(ctx, templates)
	if err != nil {
		return nil, err
	}

	return dto.ToTemplateResponsesFromListRows(templates, usernames), nil
}
