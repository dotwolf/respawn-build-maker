package services

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"main/apps/api/internal/dto"
	"main/apps/api/internal/repository"

	"github.com/jackc/pgx/v5"
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
func (s *TemplateService) CreateTemplateWithComponents(ctx context.Context, creatorUserID int32, req *dto.TemplateCreateRequest) (*dto.TemplateResponse, error) {
	if req == nil {
		return nil, validationError("request is required")
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return nil, validationError("template name is required")
	}
	if creatorUserID <= 0 {
		return nil, validationError("creator user id is required")
	}
	if len(req.Components) == 0 {
		return nil, validationError("at least one component is required")
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
		ID:               templateID,
		Name:             name,
		Description:      descValue,
		CreatorUserID:    creatorUserID,
		Stats:            statsValue,
		Rules:            []byte(req.Rules),
		Components:       []byte("[]"),
		IsPrivate:        req.IsPrivate,
		AllowSuggestions: req.AllowSuggestions,
		CreatedAt:        pgtype.Timestamptz{Time: now, Valid: true},
		UpdatedAt:        pgtype.Timestamptz{Time: now, Valid: true},
	})
	if err != nil {
		return nil, fmt.Errorf("failed to create template: %w", err)
	}

	// 3. Create Components within Transaction
	createdComponents := make([]dto.ComponentCreateInput, 0, len(req.Components))
	for _, comp := range req.Components {
		compName := strings.TrimSpace(comp.Name)
		if compName == "" {
			return nil, validationError("component name is required")
		}
		compCategory := strings.TrimSpace(comp.Category)
		if compCategory == "" {
			return nil, validationError("component category is required")
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

func (s *TemplateService) CreateTemplate(ctx context.Context, creatorUserID int32, req *dto.TemplateCreateRequest) (*dto.TemplateResponse, error) {
	if req == nil {
		return nil, validationError("request is required")
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return nil, validationError("template name is required")
	}
	if creatorUserID <= 0 {
		return nil, validationError("creator user id is required")
	}

	now := time.Now()
	templateID := fmt.Sprintf("tmpl-%d", now.UnixNano())

	template, err := s.queries.CreateTemplate(ctx, repository.CreateTemplateParams{
		ID:               templateID,
		Name:             name,
		CreatorUserID:    creatorUserID,
		Stats:            []byte("[]"),
		Components:       []byte("[]"),
		IsPrivate:        req.IsPrivate,
		AllowSuggestions: req.AllowSuggestions,
		CreatedAt:        pgtype.Timestamptz{Time: now, Valid: true},
		UpdatedAt:        pgtype.Timestamptz{Time: now, Valid: true},
		Rules:            []byte(req.Rules),
	})
	if err != nil {
		return nil, err
	}

	return dto.ToTemplateResponse(&template, nil), nil
}

func (s *TemplateService) GetTemplateByID(ctx context.Context, id string) (*dto.TemplateResponse, error) {
	if strings.TrimSpace(id) == "" {
		return nil, validationError("template id is required")
	}

	template, err := s.queries.GetTemplateByID(ctx, id)
	if err != nil {
		return nil, err
	}
	return s.templateResponseWithComponents(ctx, &template)
}

// GetTemplateByIDForUser returns a template the requester is allowed to see:
// any public template, or the requester's own private templates. Private
// templates that do not belong to the requester surface as not found so the
// resource's existence is not disclosed.
func (s *TemplateService) GetTemplateByIDForUser(ctx context.Context, id string, requesterID int32) (*dto.TemplateResponse, error) {
	if strings.TrimSpace(id) == "" {
		return nil, validationError("template id is required")
	}

	template, err := s.queries.GetTemplateByIDAny(ctx, id)
	if err != nil {
		return nil, err
	}
	if template.IsPrivate && requesterID != template.CreatorUserID {
		return nil, ErrNotFound
	}
	return s.templateResponseWithComponents(ctx, &template)
}

func (s *TemplateService) templateResponseWithComponents(ctx context.Context, template *repository.Template) (*dto.TemplateResponse, error) {
	// Fetch associated components for full view. Use a large limit so templates
	// with more than 100 components load completely.
	dbComponents, err := s.queries.ListComponentsByTemplate(ctx, repository.ListComponentsByTemplateParams{
		TemplateID: template.ID,
		Limit:      100000,
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

	return dto.ToTemplateResponse(template, components), nil
}

func (s *TemplateService) ListTemplatesByUser(ctx context.Context, creatorUserID int32, requesterID int32, limit int32, offset int32) ([]*dto.TemplateResponse, error) {
	if creatorUserID <= 0 {
		return nil, validationError("creator user id is required")
	}
	if limit <= 0 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}

	templates, err := s.queries.ListTemplatesByUser(ctx, repository.ListTemplatesByUserParams{
		CreatorUserID: creatorUserID,
		RequesterID:   requesterID,
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

func (s *TemplateService) CountTemplatesByUser(ctx context.Context, creatorUserID int32, requesterID int32) (int64, error) {
	if creatorUserID <= 0 {
		return 0, validationError("creator user id is required")
	}

	return s.queries.CountTemplatesByUser(ctx, repository.CountTemplatesByUserParams{
		CreatorUserID: creatorUserID,
		RequesterID:   requesterID,
	})
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

func (s *TemplateService) UpdateTemplate(ctx context.Context, actorID int32, req *dto.TemplateUpdateRequest) (*dto.TemplateResponse, error) {
	if req == nil {
		return nil, validationError("request is required")
	}
	if strings.TrimSpace(req.ID) == "" {
		return nil, validationError("template id is required")
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return nil, validationError("template name is required")
	}

	creatorID, err := s.queries.GetTemplateCreatorByID(ctx, req.ID)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrNotFound
		}
		return nil, err
	}
	if creatorID != actorID {
		return nil, ErrForbidden
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

	allowSuggestions := false
	if req.AllowSuggestions != nil {
		allowSuggestions = *req.AllowSuggestions
	}

	template, err := qtx.UpdateTemplate(ctx, repository.UpdateTemplateParams{
		ID:               req.ID,
		Name:             name,
		Description:      descValue,
		Stats:            statsValue,
		Rules:            []byte(req.Rules),
		IsPrivate:        isPrivate,
		AllowSuggestions: allowSuggestions,
		UpdatedAt:        pgtype.Timestamptz{Time: now, Valid: true},
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
			return nil, validationError("component name is required")
		}
		compCategory := strings.TrimSpace(comp.Category)
		if compCategory == "" {
			return nil, validationError("component category is required")
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

func (s *TemplateService) DeleteTemplate(ctx context.Context, actorID int32, id string) error {
	if strings.TrimSpace(id) == "" {
		return validationError("template id is required")
	}

	creatorID, err := s.queries.GetTemplateCreatorByID(ctx, id)
	if err != nil {
		if err == pgx.ErrNoRows {
			return ErrNotFound
		}
		return err
	}
	if creatorID != actorID {
		return ErrForbidden
	}

	return s.queries.DeleteTemplate(ctx, id)
}

func (s *TemplateService) CreateComponent(ctx context.Context, templateID string, name string, category string, effects []byte, hasLevels bool, levelScaling *string, levelRule []byte, isDeleted bool) (*repository.Component, error) {
	if strings.TrimSpace(templateID) == "" {
		return nil, validationError("template id is required")
	}
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, validationError("component name is required")
	}
	category = strings.TrimSpace(category)
	if category == "" {
		return nil, validationError("component category is required")
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
		return nil, validationError("template id is required")
	}
	if componentID <= 0 {
		return nil, validationError("component id is required")
	}

	component, err := s.queries.GetComponentByID(ctx, repository.GetComponentByIDParams{ID: componentID, TemplateID: templateID})
	if err != nil {
		return nil, err
	}
	return &component, nil
}

func (s *TemplateService) ListComponentsByTemplate(ctx context.Context, templateID string, limit int32, offset int32) ([]*repository.Component, error) {
	if strings.TrimSpace(templateID) == "" {
		return nil, validationError("template id is required")
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
		return nil, validationError("template id is required")
	}
	if componentID <= 0 {
		return nil, validationError("component id is required")
	}
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, validationError("component name is required")
	}
	category = strings.TrimSpace(category)
	if category == "" {
		return nil, validationError("component category is required")
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
		return validationError("template id is required")
	}
	if componentID <= 0 {
		return validationError("component id is required")
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
