package dto

type StatsResponse struct {
	Templates int64 `json:"templates"`
	Builds    int64 `json:"builds"`
	Likes     int64 `json:"likes"`
}
