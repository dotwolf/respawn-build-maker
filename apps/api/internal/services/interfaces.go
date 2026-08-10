package services

import (
	"context"
	"main/apps/api/internal/dto"
	"main/apps/api/internal/repository"
)

type UserServiceInterface interface {
	CreateUser(ctx context.Context, user *dto.UserRegisterRequest) (*dto.PrivateProfileResponse, error)
	GetUserByUsername(ctx context.Context, username string) (*dto.PublicProfileResponse, error)
	GetUserById(ctx context.Context, id int32) (*dto.PublicProfileResponse, error)
	GetPrivateUserByID(ctx context.Context, id int32) (*dto.PrivateProfileResponse, error)
	DeleteUser(ctx context.Context, id int32) error
	UpdateUsername(ctx context.Context, userID int32, req *dto.UpdateUsernameRequest) (*dto.PrivateProfileResponse, error)
	ListUsers(ctx context.Context, params repository.ListUsersParams) ([]*dto.PublicProfileResponse, error)
}

type AuthServiceInterface interface {
	Login(ctx context.Context, req *dto.LoginRequest) (string, *dto.PrivateProfileResponse, error)
	LoginWithGoogle(ctx context.Context, req *dto.GoogleLoginRequest) (string, *dto.PrivateProfileResponse, error)
}

type TemplateServiceInterface interface {
	CreateTemplate(ctx context.Context, creatorUserID int32, req *dto.TemplateCreateRequest) (*dto.TemplateResponse, error)
	CreateTemplateWithComponents(ctx context.Context, creatorUserID int32, req *dto.TemplateCreateRequest) (*dto.TemplateResponse, error)
	GetTemplateByID(ctx context.Context, id string) (*dto.TemplateResponse, error)
	GetTemplateByIDForUser(ctx context.Context, id string, requesterID int32) (*dto.TemplateResponse, error)
	ListTemplatesByUser(ctx context.Context, creatorUserID int32, requesterID int32, limit int32, offset int32) ([]*dto.TemplateResponse, error)
	ListPublicTemplates(ctx context.Context, limit int32, offset int32) ([]*dto.TemplateResponse, error)
	CountTemplatesByUser(ctx context.Context, creatorUserID int32, requesterID int32) (int64, error)
	UpdateTemplate(ctx context.Context, actorID int32, req *dto.TemplateUpdateRequest) (*dto.TemplateResponse, error)
	DeleteTemplate(ctx context.Context, actorID int32, id string) error
}

type StatsServiceInterface interface {
	GetPublicStats(ctx context.Context) (*dto.StatsResponse, error)
}

type SuggestionServiceInterface interface {
	CreateSuggestion(ctx context.Context, authorUserID int32, templateID string, req *dto.SuggestionCreateRequest) (*dto.SuggestionResponse, error)
	ListSuggestionsByTemplate(ctx context.Context, templateID string, requesterID int32, limit int32, offset int32) ([]*dto.SuggestionResponse, error)
	AcceptSuggestion(ctx context.Context, actorID int32, templateID string, suggestionID string) (*dto.SuggestionResponse, error)
	DeleteSuggestion(ctx context.Context, actorID int32, templateID string, suggestionID string) error
	CountPendingSuggestionsForOwner(ctx context.Context, ownerID int32) (int64, error)
	ListPendingSuggestionNotificationsForOwner(ctx context.Context, ownerID int32) ([]*dto.PendingSuggestionNotificationResponse, error)
	CountUnreadAcceptedSuggestionsForAuthor(ctx context.Context, userID int32) (int64, error)
	GetNotifications(ctx context.Context, userID int32) ([]*dto.SuggestionNotificationResponse, error)
}

type BuildServiceInterface interface {
	CreateBuild(ctx context.Context, templateID string, creatorUserID int32, req *dto.BuildCreateRequest) (*dto.BuildResponse, error)
	GetBuildByID(ctx context.Context, templateID, id string, requesterID int32) (*dto.BuildResponse, error)
	ListBuildsByTemplate(ctx context.Context, templateID string, requesterID int32, limit int32, offset int32) ([]*dto.BuildResponse, error)
	ListBuildsByUser(ctx context.Context, creatorUserID int32, limit int32, offset int32) ([]*dto.BuildResponse, error)
	ListPublicBuilds(ctx context.Context, templateID string, limit int32, offset int32) ([]*dto.BuildResponse, error)
	ListLikedBuilds(ctx context.Context, userID int32, limit int32, offset int32) ([]*dto.BuildResponse, error)
	CountBuildsByUser(ctx context.Context, creatorUserID int32) (int64, error)
	CountLikedBuildsByUser(ctx context.Context, userID int32) (int64, error)
	UpdateBuild(ctx context.Context, requesterID int32, templateID string, req *dto.BuildUpdateRequest) (*dto.BuildResponse, error)
	DeleteBuild(ctx context.Context, requesterID int32, id string) error
	VoteBuild(ctx context.Context, userID int32, buildID string, value int16) (*dto.BuildResponse, error)
	RemoveBuildVote(ctx context.Context, userID int32, buildID string) (*dto.BuildResponse, error)
}
