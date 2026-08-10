package services

import (
	"context"

	"main/apps/api/internal/dto"
	"main/apps/api/internal/repository"

	"github.com/jackc/pgx/v5/pgxpool"
)

type StatsService struct {
	queries *repository.Queries
}

func NewStatsService(pool *pgxpool.Pool) *StatsService {
	return &StatsService{queries: repository.New(pool)}
}

// GetPublicStats returns platform-wide counts of publicly visible content.
func (s *StatsService) GetPublicStats(ctx context.Context) (*dto.StatsResponse, error) {
	templates, err := s.queries.CountPublicTemplates(ctx)
	if err != nil {
		return nil, err
	}
	builds, err := s.queries.CountPublicBuilds(ctx)
	if err != nil {
		return nil, err
	}
	likes, err := s.queries.CountPublicBuildVotes(ctx)
	if err != nil {
		return nil, err
	}

	return &dto.StatsResponse{
		Templates: templates,
		Builds:    builds,
		Likes:     likes,
	}, nil
}
