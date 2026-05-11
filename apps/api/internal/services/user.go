package services

import (
	"context"
	"errors"
	"main/apps/api/internal/dto"
	"main/apps/api/internal/repository"
	"regexp"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

func CreateUser(ctx context.Context, conn *pgxpool.Pool, user *dto.UserRegisterRequest) (*dto.PrivateProfileResponse, error) {
	queries := repository.New(conn)

	exists, err := queries.UserExists(ctx, repository.UserExistsParams{
		Username: user.Username,
		Email:    user.Email,
	})
	if err != nil {
		return nil, err
	}
	if exists {
		return nil, errors.New("username or email already taken")
	}
	if err := validateUsername(user.Username); err != nil {
		return nil, err
	}
	if err := validateEmail(user.Email); err != nil {
		return nil, err
	}
	if err := validatePassword(user.Password); err != nil {
		return nil, err
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(user.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}

	now := time.Now()

	result, err := queries.CreateUser(ctx, repository.CreateUserParams{
		Username:  user.Username,
		Email:     user.Email,
		Password:  string(hashedPassword),
		CreatedAt: pgtype.Timestamptz{Time: now, Valid: true},
		UpdatedAt: pgtype.Timestamptz{Time: now, Valid: true},
	})
	if err != nil {
		return nil, err
	}

	return dto.ToPrivateProfile(&result), nil
}

func GetUserById(ctx context.Context, conn *pgxpool.Pool, id int32) (*dto.PublicProfileResponse, error) {
	queries := repository.New(conn)
	user, err := queries.GetUserByID(ctx, id)
	if err != nil {
		return nil, err
	}
	return dto.ToPublicProfile(&user), nil
}

func GetUserByUsername(ctx context.Context, conn *pgxpool.Pool, username string) (*dto.PublicProfileResponse, error) {
	queries := repository.New(conn)
	user, err := queries.GetUserByUsername(ctx, username)
	if err != nil {
		return nil, err
	}
	return dto.ToPublicProfile(&user), nil
}

func DeleteUser(ctx context.Context, conn *pgxpool.Pool, id int32) error {
	queries := repository.New(conn)
	return queries.DeleteUser(ctx, id)
}

func ListUsers(ctx context.Context, conn *pgxpool.Pool, params repository.ListUsersParams) ([]*dto.PublicProfileResponse, error) {
	queries := repository.New(conn)
	users, err := queries.ListUsers(ctx, params)
	if err != nil {
		return nil, err
	}
	var result []*dto.PublicProfileResponse
	for _, user := range users {
		result = append(result, dto.ToPublicProfileFromRow(&user))
	}
	return result, nil
}

func validateUsername(username string) error {
	if len(username) < 4 || len(username) > 30 {
		return errors.New("username must be 4 to 30 characters")
	}
	valid := regexp.MustCompile(`^[a-zA-Z0-9_]+$`).MatchString
	if !valid(username) {
		return errors.New("username can only contain letters, numbers, and underscores")
	}
	return nil
}

func validateEmail(email string) error {
	valid := regexp.MustCompile(`^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$`).MatchString
	if !valid(email) {
		return errors.New("invalid email format")
	}
	return nil
}

func validatePassword(password string) error {
	if len(password) < 8 || len(password) > 50 {
		return errors.New("password must be 8 to 50 characters")
	}
	upper := regexp.MustCompile(`[A-Z]`).MatchString
	lower := regexp.MustCompile(`[a-z]`).MatchString
	number := regexp.MustCompile(`[0-9]`).MatchString
	special := regexp.MustCompile(`[!@#~$%^&*()_+|<>{}[\]\/?]`).MatchString
	if !upper(password) || !lower(password) || !number(password) || !special(password) {
		return errors.New("password must contain at least one uppercase letter, one lowercase letter, one number, and one special character")
	}
	return nil
}
