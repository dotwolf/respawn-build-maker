package middleware

import (
	"os"
	"strings"

	"github.com/gin-contrib/cors"
)

const defaultAllowedOrigins = "http://localhost:3000,http://localhost:8080"

// CorsConfig builds a CORS configuration from the CORS_ALLOWED_ORIGINS
// environment variable (comma-separated). It intentionally allows only
// explicit origins because credentials are shared with the browser.
func CorsConfig() cors.Config {
	origins := strings.TrimSpace(os.Getenv("CORS_ALLOWED_ORIGINS"))
	if origins == "" {
		origins = defaultAllowedOrigins
	}

	return cors.Config{
		AllowOrigins:     splitCSV(origins),
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization"},
		AllowCredentials: true,
		MaxAge:           3600,
	}
}

func splitCSV(value string) []string {
	parts := strings.Split(value, ",")
	result := make([]string, 0, len(parts))
	for _, p := range parts {
		if trimmed := strings.TrimSpace(p); trimmed != "" {
			result = append(result, trimmed)
		}
	}
	return result
}
