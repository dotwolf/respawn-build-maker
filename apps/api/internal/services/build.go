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

type BuildService struct {
	queries *repository.Queries
}

func NewBuildService(pool *pgxpool.Pool) *BuildService {
	return &BuildService{queries: repository.New(pool)}
}

func validateBuildTemplateAccess(buildTemplateID, templateID string) error {
	buildTemplateID = strings.TrimSpace(buildTemplateID)
	templateID = strings.TrimSpace(templateID)

	if templateID == "" {
		return validationError("template id is required")
	}
	if buildTemplateID == "" {
		return validationError("build template id is required")
	}
	if buildTemplateID != templateID {
		return validationError("build does not belong to template")
	}
	return nil
}

func (s *BuildService) CreateBuild(ctx context.Context, templateID string, creatorUserID int32, req *dto.BuildCreateRequest) (*dto.BuildResponse, error) {
	if req == nil {
		return nil, validationError("request is required")
	}

	name := strings.TrimSpace(req.Name)
	if name == "" {
		return nil, validationError("build name is required")
	}
	if creatorUserID <= 0 {
		return nil, validationError("creator user id is required")
	}
	if strings.TrimSpace(templateID) == "" {
		return nil, validationError("template id is required")
	}

	now := time.Now()
	buildID := fmt.Sprintf("build-%d", now.UnixNano())

	description := pgtype.Text{String: strings.TrimSpace(req.Description), Valid: strings.TrimSpace(req.Description) != ""}

	build, err := s.queries.CreateBuild(ctx, repository.CreateBuildParams{
		ID:            buildID,
		Name:          name,
		Description:   description,
		CreatorUserID: creatorUserID,
		TemplateID:    templateID,
		CreatedAt:     pgtype.Timestamptz{Time: now, Valid: true},
		UpdatedAt:     pgtype.Timestamptz{Time: now, Valid: true},
		Tags:          req.Tags,
		VoteScore:     0,
		Components:    []byte(req.Components),
		IsPrivate:     req.IsPrivate,
	})
	if err != nil {
		return nil, err
	}

	return dto.ToBuildResponseFromCreate(&build), nil
}

func (s *BuildService) GetBuildByID(ctx context.Context, templateID, id string, requesterID int32) (*dto.BuildResponse, error) {
	if strings.TrimSpace(id) == "" {
		return nil, validationError("build id is required")
	}

	build, err := s.queries.GetBuildByIDAny(ctx, id)
	if err != nil {
		return nil, err
	}
	if build.IsPrivate && requesterID != build.CreatorUserID {
		return nil, ErrNotFound
	}
	if err := validateBuildTemplateAccess(build.TemplateID, templateID); err != nil {
		return nil, err
	}

	resp := dto.ToBuildResponse(&repository.Build{
		ID:            build.ID,
		Name:          build.Name,
		Description:   build.Description,
		CreatorUserID: build.CreatorUserID,
		TemplateID:    build.TemplateID,
		Tags:          build.Tags,
		VoteScore:     build.VoteScore,
		Components:    build.Components,
		IsPrivate:     build.IsPrivate,
		CreatedAt:     build.CreatedAt,
		UpdatedAt:     build.UpdatedAt,
	})
	enriched, err := s.enrichBuilds(ctx, []*dto.BuildResponse{resp})
	if err != nil {
		return nil, err
	}
	return enriched[0], nil
}

func (s *BuildService) ListBuildsByUser(ctx context.Context, creatorUserID int32, limit int32, offset int32) ([]*dto.BuildResponse, error) {
	if creatorUserID <= 0 {
		return nil, validationError("creator user id is required")
	}
	if limit <= 0 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}

	builds, err := s.queries.ListBuildsByUser(ctx, repository.ListBuildsByUserParams{
		CreatorUserID: creatorUserID,
		Limit:         limit,
		Offset:        offset,
	})
	if err != nil {
		return nil, err
	}

	return s.enrichBuilds(ctx, dto.ToBuildResponsesFromListByUser(builds))
}

func (s *BuildService) CountBuildsByUser(ctx context.Context, creatorUserID int32) (int64, error) {
	if creatorUserID <= 0 {
		return 0, validationError("creator user id is required")
	}

	return s.queries.CountBuildsByUser(ctx, creatorUserID)
}

func (s *BuildService) ListBuildsByTemplate(ctx context.Context, templateID string, requesterID int32, limit int32, offset int32) ([]*dto.BuildResponse, error) {
	if strings.TrimSpace(templateID) == "" {
		return nil, validationError("template id is required")
	}
	if limit <= 0 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}

	builds, err := s.queries.ListBuildsByTemplate(ctx, repository.ListBuildsByTemplateParams{
		TemplateID:  templateID,
		RequesterID: requesterID,
		Limit:       limit,
		Offset:      offset,
	})
	if err != nil {
		return nil, err
	}

	return dto.ToBuildResponsesFromListByTemplate(builds), nil
}

// ListPublicBuilds returns publicly visible builds, optionally scoped to a
// template. Responses are enriched with the creator's username and the
// template's name for display and client-side filtering.
func (s *BuildService) ListPublicBuilds(ctx context.Context, templateID string, limit int32, offset int32) ([]*dto.BuildResponse, error) {
	if limit <= 0 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}

	var builds []*dto.BuildResponse

	if strings.TrimSpace(templateID) != "" {
		rows, qerr := s.queries.ListPublicBuildsByTemplate(ctx, repository.ListPublicBuildsByTemplateParams{
			TemplateID: templateID,
			Limit:      limit,
			Offset:     offset,
		})
		if qerr != nil {
			return nil, qerr
		}
		builds = dto.ToBuildResponsesFromListPublicByTemplate(rows)
	} else {
		rows, qerr := s.queries.ListPublicBuilds(ctx, repository.ListPublicBuildsParams{
			Limit:  limit,
			Offset: offset,
		})
		if qerr != nil {
			return nil, qerr
		}
		builds = dto.ToBuildResponsesFromListPublic(rows)
	}

	return s.enrichBuilds(ctx, builds)
}

// ListLikedBuilds returns the builds the authenticated user has upvoted.
func (s *BuildService) ListLikedBuilds(ctx context.Context, userID int32, limit int32, offset int32) ([]*dto.BuildResponse, error) {
	if userID <= 0 {
		return nil, validationError("user id is required")
	}
	if limit <= 0 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}

	rows, err := s.queries.ListLikedBuildsByUser(ctx, repository.ListLikedBuildsByUserParams{
		UserID: userID,
		Limit:  limit,
		Offset: offset,
	})
	if err != nil {
		return nil, err
	}

	return s.enrichBuilds(ctx, dto.ToBuildResponsesFromListLiked(rows))
}

func (s *BuildService) CountLikedBuildsByUser(ctx context.Context, userID int32) (int64, error) {
	if userID <= 0 {
		return 0, validationError("user id is required")
	}

	return s.queries.CountLikedBuildsByUser(ctx, userID)
}

// enrichBuilds fills in creator usernames and template names in a single pass.
func (s *BuildService) enrichBuilds(ctx context.Context, builds []*dto.BuildResponse) ([]*dto.BuildResponse, error) {
	if len(builds) == 0 {
		return builds, nil
	}

	userIDs := make([]int32, 0, len(builds))
	seenUsers := make(map[int32]struct{}, len(builds))
	templateIDs := make([]string, 0, len(builds))
	seenTemplates := make(map[string]struct{}, len(builds))
	for _, b := range builds {
		if b == nil {
			continue
		}
		if _, ok := seenUsers[b.CreatorUserID]; !ok {
			seenUsers[b.CreatorUserID] = struct{}{}
			userIDs = append(userIDs, b.CreatorUserID)
		}
		if _, ok := seenTemplates[b.TemplateID]; !ok {
			seenTemplates[b.TemplateID] = struct{}{}
			templateIDs = append(templateIDs, b.TemplateID)
		}
	}

	userNames := make(map[int32]string, len(userIDs))
	if len(userIDs) > 0 {
		users, err := s.queries.GetUsersByIDs(ctx, userIDs)
		if err != nil {
			return nil, fmt.Errorf("failed to fetch build creators: %w", err)
		}
		for _, u := range users {
			userNames[u.ID] = u.Username
		}
	}

	templateNames := make(map[string]string, len(templateIDs))
	if len(templateIDs) > 0 {
		templates, err := s.queries.GetTemplatesByIDs(ctx, templateIDs)
		if err != nil {
			return nil, fmt.Errorf("failed to fetch build templates: %w", err)
		}
		for _, t := range templates {
			templateNames[t.ID] = t.Name
		}
	}

	for _, b := range builds {
		if b == nil {
			continue
		}
		b.CreatorUsername = userNames[b.CreatorUserID]
		b.TemplateName = templateNames[b.TemplateID]
	}
	return builds, nil
}

func (s *BuildService) UpdateBuild(ctx context.Context, requesterID int32, templateID string, req *dto.BuildUpdateRequest) (*dto.BuildResponse, error) {
	if req == nil {
		return nil, validationError("request is required")
	}
	id := strings.TrimSpace(req.ID)
	if id == "" {
		return nil, validationError("build id is required")
	}
	if requesterID <= 0 {
		return nil, validationError("requester user id is required")
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return nil, validationError("build name is required")
	}

	build, err := s.queries.GetBuildByIDAny(ctx, id)
	if err != nil {
		return nil, err
	}
	if requesterID != build.CreatorUserID {
		return nil, ErrForbidden
	}
	if err := validateBuildTemplateAccess(build.TemplateID, templateID); err != nil {
		return nil, err
	}

	now := time.Now()
	description := pgtype.Text{String: strings.TrimSpace(req.Description), Valid: strings.TrimSpace(req.Description) != ""}

	updated, err := s.queries.UpdateBuild(ctx, repository.UpdateBuildParams{
		ID:          id,
		Name:        name,
		Description: description,
		UpdatedAt:   pgtype.Timestamptz{Time: now, Valid: true},
		Tags:        req.Tags,
		Components:  []byte(req.Components),
		IsPrivate:   req.IsPrivate,
	})
	if err != nil {
		return nil, err
	}

	resp := dto.ToBuildResponseFromUpdate(&updated)
	enriched, err := s.enrichBuilds(ctx, []*dto.BuildResponse{resp})
	if err != nil {
		return nil, err
	}
	return enriched[0], nil
}

func (s *BuildService) DeleteBuild(ctx context.Context, requesterID int32, id string) error {
	if strings.TrimSpace(id) == "" {
		return validationError("build id is required")
	}
	if requesterID <= 0 {
		return validationError("requester user id is required")
	}
	build, err := s.queries.GetBuildByIDAny(ctx, id)
	if err != nil {
		return err
	}
	if requesterID != build.CreatorUserID {
		return ErrForbidden
	}
	return s.queries.DeleteBuild(ctx, id)
}

func (s *BuildService) VoteBuild(ctx context.Context, userID int32, buildID string, value int16) (*dto.BuildResponse, error) {
	if userID <= 0 {
		return nil, validationError("user id is required")
	}
	if strings.TrimSpace(buildID) == "" {
		return nil, validationError("build id is required")
	}
	if value != 1 && value != -1 {
		return nil, validationError("vote value must be 1 or -1")
	}

	build, err := s.queries.GetBuildByID(ctx, buildID)
	if err != nil {
		return nil, err
	}

	var delta int32
	vote, err := s.queries.GetBuildVote(ctx, repository.GetBuildVoteParams{UserID: userID, BuildID: buildID})
	if err == nil {
		delta = int32(value) - int32(vote.Value)
	} else {
		delta = int32(value)
	}

	_, err = s.queries.UpsertBuildVote(ctx, repository.UpsertBuildVoteParams{
		UserID:    userID,
		BuildID:   buildID,
		Value:     value,
		CreatedAt: pgtype.Timestamptz{Time: time.Now(), Valid: true},
	})
	if err != nil {
		return nil, err
	}

	updatedBuild, err := s.queries.UpdateBuildVoteScore(ctx, repository.UpdateBuildVoteScoreParams{
		VoteScore: build.VoteScore + delta,
		UpdatedAt: pgtype.Timestamptz{Time: time.Now(), Valid: true},
		ID:        buildID,
	})
	if err != nil {
		return nil, err
	}

	return dto.ToBuildResponse(&repository.Build{
		ID:            updatedBuild.ID,
		Name:          updatedBuild.Name,
		CreatorUserID: updatedBuild.CreatorUserID,
		TemplateID:    updatedBuild.TemplateID,
		CreatedAt:     updatedBuild.CreatedAt,
		UpdatedAt:     updatedBuild.UpdatedAt,
		Tags:          updatedBuild.Tags,
		VoteScore:     updatedBuild.VoteScore,
		Components:    updatedBuild.Components,
	}), nil
}

func (s *BuildService) RemoveBuildVote(ctx context.Context, userID int32, buildID string) (*dto.BuildResponse, error) {
	if userID <= 0 {
		return nil, validationError("user id is required")
	}
	if strings.TrimSpace(buildID) == "" {
		return nil, validationError("build id is required")
	}

	build, err := s.queries.GetBuildByID(ctx, buildID)
	if err != nil {
		return nil, err
	}

	vote, err := s.queries.GetBuildVote(ctx, repository.GetBuildVoteParams{UserID: userID, BuildID: buildID})
	if err != nil {
		return nil, err
	}

	err = s.queries.DeleteBuildVote(ctx, repository.DeleteBuildVoteParams{UserID: userID, BuildID: buildID})
	if err != nil {
		return nil, err
	}

	updatedBuild, err := s.queries.UpdateBuildVoteScore(ctx, repository.UpdateBuildVoteScoreParams{
		VoteScore: build.VoteScore - int32(vote.Value),
		UpdatedAt: pgtype.Timestamptz{Time: time.Now(), Valid: true},
		ID:        buildID,
	})
	if err != nil {
		return nil, err
	}

	return dto.ToBuildResponse(&repository.Build{
		ID:            updatedBuild.ID,
		Name:          updatedBuild.Name,
		CreatorUserID: updatedBuild.CreatorUserID,
		TemplateID:    updatedBuild.TemplateID,
		CreatedAt:     updatedBuild.CreatedAt,
		UpdatedAt:     updatedBuild.UpdatedAt,
		Tags:          updatedBuild.Tags,
		VoteScore:     updatedBuild.VoteScore,
		Components:    updatedBuild.Components,
	}), nil
}
