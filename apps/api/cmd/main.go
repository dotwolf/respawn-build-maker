package main

import (
	"context"
	"fmt"
	"main/apps/api/internal/auth"
	"main/apps/api/internal/middleware"
	"main/apps/api/internal/routes"
	"os"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
)

// @title           Respawn Build Maker API
// @version         1.0
// @description     API for Respawn Build Maker application
// @host      localhost:8080
// @BasePath  /
// @securityDefinitions.apikey BearerAuth
// @in header
// @name Authorization
// @description Type "Bearer" followed by a space and the JWT token.
func main() {
	secret := auth.Secret("")
	if secret == "" {
		fmt.Fprintln(os.Stderr, "FATAL: JWT_SECRET_KEY is required")
		os.Exit(1)
	}

	if os.Getenv("GOOGLE_CLIENT_ID") == "" {
		fmt.Fprintln(os.Stderr, "WARN: GOOGLE_CLIENT_ID is not set; Google sign-in will be unavailable")
	}

	pool, err := pgxpool.New(context.Background(), os.Getenv("DATABASE_URL"))
	if err != nil {
		fmt.Fprintf(os.Stderr, "Unable to connect to database: %v\n", err)
		os.Exit(1)
	}

	gin.SetMode(os.Getenv("GIN_MODE"))
	r := gin.New()
	r.Use(gin.Logger())
	r.Use(gin.Recovery())
	r.Use(middleware.SecurityHeaders())
	r.Use(middleware.BodyLimit(10 << 20))
	r.Use(cors.New(middleware.CorsConfig()))

	routes.SetupRoutes(r, pool)
	r.Run(":8080")
}
