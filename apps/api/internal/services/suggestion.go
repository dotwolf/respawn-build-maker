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

type SuggestionService struct {
	pool    *pgxpool.Pool
	queries *repository.Queries
}

func NewSuggestionService(pool *pgxpool.Pool) *SuggestionService {
	return &SuggestionService{
		pool:    pool,
		queries: repository.New(pool),
	}
}

func (s *SuggestionService) suggestionChangeSetJSON(changeSet *dto.SuggestionChangeSet) ([]byte, error) {
	if changeSet == nil {
		changeSet = &dto.SuggestionChangeSet{}
	}
	raw, err := json.Marshal(changeSet)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal suggestion changes: %w", err)
	}
	return raw, nil
}

func (s *SuggestionService) usernameByID(ctx context.Context, userID int32) (string, error) {
	users, err := s.queries.GetUsersByIDs(ctx, []int32{userID})
	if err != nil {
		return "", err
	}
	if len(users) == 0 {
		return "", nil
	}
	return users[0].Username, nil
}

// CreateSuggestion creates or updates the requesting user's pending suggestion
// for a public template. Only one pending suggestion per (template, author)
// pair is allowed; resubmitting overwrites the previous one.
func (s *SuggestionService) CreateSuggestion(ctx context.Context, authorUserID int32, templateID string, req *dto.SuggestionCreateRequest) (*dto.SuggestionResponse, error) {
	if req == nil {
		return nil, validationError("request is required")
	}
	if strings.TrimSpace(templateID) == "" {
		return nil, validationError("template id is required")
	}
	if authorUserID <= 0 {
		return nil, validationError("author user id is required")
	}
	if len(req.Added) == 0 && len(req.Edited) == 0 && len(req.Removed) == 0 {
		return nil, validationError("a suggestion must add, edit or remove at least one component")
	}

	template, err := s.queries.GetTemplateByIDAny(ctx, templateID)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrNotFound
		}
		return nil, err
	}
	if template.IsPrivate {
		return nil, ErrNotFound
	}
	if template.CreatorUserID == authorUserID {
		return nil, validationError("you cannot suggest changes to your own template")
	}
	if !template.AllowSuggestions {
		return nil, validationError("this template does not accept suggestions")
	}

	var descValue pgtype.Text
	if req.Description != nil {
		descValue = pgtype.Text{String: *req.Description, Valid: true}
	}

	changeSet := &dto.SuggestionChangeSet{
		Added:   req.Added,
		Edited:  req.Edited,
		Removed: req.Removed,
	}
	componentsValue, err := s.suggestionChangeSetJSON(changeSet)
	if err != nil {
		return nil, err
	}

	now := time.Now()
	existing, err := s.queries.GetPendingSuggestionByTemplateAndAuthor(ctx, repository.GetPendingSuggestionByTemplateAndAuthorParams{
		TemplateID:   templateID,
		AuthorUserID: authorUserID,
	})
	if err != nil && err != pgx.ErrNoRows {
		return nil, err
	}

	var suggestion repository.TemplateSuggestion
	if err == nil {
		suggestion, err = s.queries.UpdateSuggestion(ctx, repository.UpdateSuggestionParams{
			ID:          existing.ID,
			Description: descValue,
			Components:  componentsValue,
			UpdatedAt:   pgtype.Timestamptz{Time: now, Valid: true},
		})
		if err != nil {
			return nil, err
		}
	} else {
		suggestion, err = s.queries.CreateSuggestion(ctx, repository.CreateSuggestionParams{
			ID:             fmt.Sprintf("sug-%d", now.UnixNano()),
			TemplateID:     templateID,
			AuthorUserID:   authorUserID,
			Description:    descValue,
			Components:     componentsValue,
			Status:         "pending",
			AuthorNotified: false,
			CreatedAt:      pgtype.Timestamptz{Time: now, Valid: true},
			UpdatedAt:      pgtype.Timestamptz{Time: now, Valid: true},
		})
		if err != nil {
			return nil, err
		}
	}

	authorName, err := s.usernameByID(ctx, authorUserID)
	if err != nil {
		return nil, err
	}

	return dto.ToSuggestionResponse(&suggestion, changeSet, authorName), nil
}

// ListSuggestionsByTemplate returns the pending suggestions for a template the
// requester owns.
func (s *SuggestionService) ListSuggestionsByTemplate(ctx context.Context, templateID string, requesterID int32, limit int32, offset int32) ([]*dto.SuggestionResponse, error) {
	if strings.TrimSpace(templateID) == "" {
		return nil, validationError("template id is required")
	}
	if limit <= 0 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}

	creatorID, err := s.queries.GetTemplateCreatorByID(ctx, templateID)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrNotFound
		}
		return nil, err
	}
	if creatorID != requesterID {
		return nil, ErrForbidden
	}

	suggestions, err := s.queries.ListSuggestionsByTemplate(ctx, repository.ListSuggestionsByTemplateParams{
		TemplateID: templateID,
		Limit:      limit,
		Offset:     offset,
	})
	if err != nil {
		return nil, err
	}

	if len(suggestions) == 0 {
		return []*dto.SuggestionResponse{}, nil
	}

	authorIDs := make([]int32, 0, len(suggestions))
	seen := make(map[int32]struct{}, len(suggestions))
	for _, sgt := range suggestions {
		if _, ok := seen[sgt.AuthorUserID]; ok {
			continue
		}
		seen[sgt.AuthorUserID] = struct{}{}
		authorIDs = append(authorIDs, sgt.AuthorUserID)
	}

	usernames := make(map[int32]string, len(authorIDs))
	users, err := s.queries.GetUsersByIDs(ctx, authorIDs)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch suggestion authors: %w", err)
	}
	for _, u := range users {
		usernames[u.ID] = u.Username
	}

	result := make([]*dto.SuggestionResponse, 0, len(suggestions))
	for _, sgt := range suggestions {
		result = append(result, dto.ToSuggestionResponse(&sgt, dto.SuggestionChangeSetFromRow(&sgt), usernames[sgt.AuthorUserID]))
	}
	return result, nil
}

// AcceptSuggestion marks a suggestion as accepted so it leaves the pending
// queue and the author gets notified. The template's component pool is NOT
// touched here: acceptance is deferred until the template owner saves the
// template, and the save (UpdateTemplate) already applies the suggestion's
// changes to the pool. This keeps the operation idempotent — re-accepting a
// suggestion whose changes were already saved will not re-apply them.
func (s *SuggestionService) AcceptSuggestion(ctx context.Context, actorID int32, templateID string, suggestionID string) (*dto.SuggestionResponse, error) {
	if strings.TrimSpace(templateID) == "" {
		return nil, validationError("template id is required")
	}
	if strings.TrimSpace(suggestionID) == "" {
		return nil, validationError("suggestion id is required")
	}

	creatorID, err := s.queries.GetTemplateCreatorByID(ctx, templateID)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrNotFound
		}
		return nil, err
	}
	if creatorID != actorID {
		return nil, ErrForbidden
	}

	suggestion, err := s.queries.GetSuggestionByID(ctx, suggestionID)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrNotFound
		}
		return nil, err
	}
	if suggestion.TemplateID != templateID {
		return nil, ErrNotFound
	}
	if suggestion.Status != "pending" {
		return nil, conflictError("this suggestion has already been processed")
	}

	accepted, err := s.queries.AcceptSuggestion(ctx, repository.AcceptSuggestionParams{
		ID:         suggestionID,
		TemplateID: templateID,
		UpdatedAt:  pgtype.Timestamptz{Time: time.Now(), Valid: true},
	})
	if err != nil {
		return nil, err
	}

	authorName, err := s.usernameByID(ctx, accepted.AuthorUserID)
	if err != nil {
		return nil, err
	}

	changeSet := dto.SuggestionChangeSetFromRow(&suggestion)
	return dto.ToSuggestionResponse(&accepted, changeSet, authorName), nil
}

// DeleteSuggestion removes a suggestion. The template owner or the suggestion
// author may delete it.
func (s *SuggestionService) DeleteSuggestion(ctx context.Context, actorID int32, templateID string, suggestionID string) error {
	if strings.TrimSpace(templateID) == "" {
		return validationError("template id is required")
	}
	if strings.TrimSpace(suggestionID) == "" {
		return validationError("suggestion id is required")
	}

	creatorID, err := s.queries.GetTemplateCreatorByID(ctx, templateID)
	if err != nil {
		if err == pgx.ErrNoRows {
			return ErrNotFound
		}
		return err
	}

	suggestion, err := s.queries.GetSuggestionByID(ctx, suggestionID)
	if err != nil {
		if err == pgx.ErrNoRows {
			return ErrNotFound
		}
		return err
	}
	if suggestion.TemplateID != templateID {
		return ErrNotFound
	}
	if creatorID != actorID && suggestion.AuthorUserID != actorID {
		return ErrForbidden
	}

	return s.queries.DeleteSuggestion(ctx, suggestionID)
}

// CountPendingSuggestionsForOwner returns the number of pending suggestions
// across all of the user's templates, used for notification badges.
func (s *SuggestionService) CountPendingSuggestionsForOwner(ctx context.Context, ownerID int32) (int64, error) {
	return s.queries.CountPendingSuggestionsForOwner(ctx, ownerID)
}

// ListPendingSuggestionNotificationsForOwner returns, per owned template, how
// many suggestions are awaiting review. Used to notify the creator on every
// page that there is work pending.
func (s *SuggestionService) ListPendingSuggestionNotificationsForOwner(ctx context.Context, ownerID int32) ([]*dto.PendingSuggestionNotificationResponse, error) {
	rows, err := s.queries.ListPendingSuggestionCountsForOwner(ctx, ownerID)
	if err != nil {
		return nil, err
	}
	result := make([]*dto.PendingSuggestionNotificationResponse, 0, len(rows))
	for _, row := range rows {
		result = append(result, &dto.PendingSuggestionNotificationResponse{
			TemplateID:   row.TemplateID,
			TemplateName: row.TemplateName,
			PendingCount: row.PendingCount,
		})
	}
	return result, nil
}

// CountUnreadAcceptedSuggestionsForAuthor returns how many of the user's
// suggestions were accepted but have not been acknowledged yet. Unlike
// GetNotifications, it does NOT mark them as delivered.
func (s *SuggestionService) CountUnreadAcceptedSuggestionsForAuthor(ctx context.Context, userID int32) (int64, error) {
	return s.queries.CountAcceptedSuggestionsForAuthorUnnotified(ctx, userID)
}

// GetNotifications returns the accepted suggestions the user authored that
// have not been acknowledged yet, and marks them as notified.
func (s *SuggestionService) GetNotifications(ctx context.Context, userID int32) ([]*dto.SuggestionNotificationResponse, error) {
	rows, err := s.queries.ListAcceptedSuggestionsForAuthorUnnotified(ctx, userID)
	if err != nil {
		return nil, err
	}

	result := make([]*dto.SuggestionNotificationResponse, 0, len(rows))
	ids := make([]string, 0, len(rows))
	for _, row := range rows {
		result = append(result, &dto.SuggestionNotificationResponse{
			TemplateID: row.TemplateID,
			TemplateName: row.Name,
		})
		ids = append(ids, row.ID)
	}

	if len(ids) > 0 {
		if err := s.queries.MarkSuggestionAuthorNotified(ctx, ids); err != nil {
			return nil, err
		}
	}

	return result, nil
}
