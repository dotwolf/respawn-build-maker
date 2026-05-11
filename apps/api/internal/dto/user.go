package dto

import (
	"main/apps/api/internal/repository"
	"time"
)

type UserRegisterRequest struct {
	Username string `json:"username" binding:"required,min=4,max=30" msg:"Username is required and must be 4 to 30 characters"`
	Email    string `json:"email" binding:"required,email" msg:"Valid email is required"`
	Password string `json:"password" binding:"required,min=8,max=50" msg:"Password is required and must be 8 to 50 characters"`
}

type LoginRequest struct {
	Email    string `json:"email" binding:"required,email" msg:"Valid email is required"`
	Password string `json:"password" binding:"required" msg:"Password is required"`
}

type PublicProfileResponse struct {
	ID       int32  `json:"id"`
	Username string `json:"username"`
}

type PrivateProfileResponse struct {
	ID        int32     `json:"id"`
	Username  string    `json:"username"`
	Email     string    `json:"email"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

func ToPublicProfile(user *repository.User) *PublicProfileResponse {
	return &PublicProfileResponse{
		ID:       user.ID,
		Username: user.Username,
	}
}

func ToPublicProfileFromRow(user *repository.ListUsersRow) *PublicProfileResponse {
	return &PublicProfileResponse{
		ID:       user.ID,
		Username: user.Username,
	}
}

func ToPrivateProfile(user *repository.User) *PrivateProfileResponse {
	return &PrivateProfileResponse{
		ID:        user.ID,
		Username:  user.Username,
		Email:     user.Email,
		CreatedAt: user.CreatedAt.Time,
		UpdatedAt: user.UpdatedAt.Time,
	}
}
