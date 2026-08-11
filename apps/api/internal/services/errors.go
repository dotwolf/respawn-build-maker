package services

import "fmt"

var (
	ErrNotFound            = fmt.Errorf("not found")
	ErrForbidden           = fmt.Errorf("forbidden")
	ErrUnauthorized        = fmt.Errorf("unauthorized")
	ErrGoogleNotConfigured = fmt.Errorf("google login is not configured")
	ErrLoginBlocked        = fmt.Errorf("too many failed login attempts, try again later")
)

// ValidationError is returned when request data fails domain validation and
// should surface to the client as a 400 with its message.
type ValidationError struct {
	Message string
}

func (e *ValidationError) Error() string { return e.Message }

func validationError(format string, args ...any) error {
	return &ValidationError{Message: fmt.Sprintf(format, args...)}
}

// ConflictError is returned when a request conflicts with existing data
// (e.g. a unique constraint) and should surface as a 409 with its message.
type ConflictError struct {
	Message string
}

func (e *ConflictError) Error() string { return e.Message }

func conflictError(format string, args ...any) error {
	return &ConflictError{Message: fmt.Sprintf(format, args...)}
}
