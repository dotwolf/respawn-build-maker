package services

import "testing"

func TestSanitizeUsername(t *testing.T) {
	cases := map[string]string{
		"Alice Smith":         "AliceSmith",
		"alice.smith@example": "alicesmithexample",
		"a-b*c":               "abc",
		"---":                 "",
		"Jane":                "Jane",
	}
	for in, want := range cases {
		if got := sanitizeUsername(in); got != want {
			t.Errorf("sanitizeUsername(%q) = %q, want %q", in, got, want)
		}
	}
}
