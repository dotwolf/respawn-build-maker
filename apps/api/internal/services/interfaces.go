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
	ListUsers(ctx context.Context, params repository.ListUsersParams) ([]*dto.PublicProfileResponse, error)
}

type AuthServiceInterface interface {
	Login(ctx context.Context, req *dto.LoginRequest) (string, *dto.PrivateProfileResponse, error)
}

type TemplateServiceInterface interface {
	CreateTemplate(ctx context.Context, req *dto.TemplateCreateRequest) (*dto.TemplateResponse, error)
	CreateTemplateWithComponents(ctx context.Context, req *dto.TemplateCreateRequest) (*dto.TemplateResponse, error)
	GetTemplateByID(ctx context.Context, id string) (*dto.TemplateResponse, error)
	ListTemplatesByUser(ctx context.Context, creatorUserID int32, limit int32, offset int32) ([]*dto.TemplateResponse, error)
	ListPublicTemplates(ctx context.Context, limit int32, offset int32) ([]*dto.TemplateResponse, error)
}

type BuildServiceInterface interface {
	CreateBuild(ctx context.Context, templateID string, req *dto.BuildCreateRequest) (*dto.BuildResponse, error)
	GetBuildByID(ctx context.Context, templateID, id string) (*dto.BuildResponse, error)
	ListBuildsByTemplate(ctx context.Context, templateID string, limit int32, offset int32) ([]*dto.BuildResponse, error)
}
