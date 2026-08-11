package main

import (
	"context"
	"fmt"
	"main/apps/api/internal/auth"
	"main/apps/api/internal/middleware"
	"main/apps/api/internal/routes"
	"os"
	"strings"

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

	// Trust only explicitly configured proxies. gin trusts every proxy by
	// default, which would let clients forge X-Forwarded-For and bypass the
	// per-IP rate limits. When TRUSTED_PROXIES is empty, no proxy headers are
	// honored and ClientIP falls back to the socket peer address.
	configureTrustedProxies(r)

	routes.SetupRoutes(r, pool)
	r.Run(":8080")
}

// configureTrustedProxies sets the CIDR allowlist of proxies whose
// X-Forwarded-For/X-Real-IP headers may be trusted, from the TRUSTED_PROXIES
// environment variable (comma-separated). An empty value disables proxy header
// trust entirely.
func configureTrustedProxies(r *gin.Engine) {
	raw := os.Getenv("TRUSTED_PROXIES")
	if strings.TrimSpace(raw) == "" {
		r.SetTrustedProxies(nil)
		return
	}
	var cidrs []string
	for _, part := range strings.Split(raw, ",") {
		if c := strings.TrimSpace(part); c != "" {
			cidrs = append(cidrs, c)
		}
	}
	if len(cidrs) == 0 {
		r.SetTrustedProxies(nil)
		return
	}
	if err := r.SetTrustedProxies(cidrs); err != nil {
		fmt.Fprintf(os.Stderr, "WARN: invalid TRUSTED_PROXIES %q: %v\n", raw, err)
		r.SetTrustedProxies(nil)
	}
}
