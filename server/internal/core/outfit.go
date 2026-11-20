package core

import (
	"errors"
	"strings"
	"unicode/utf8"
)

// Outfit is one picture of the AI试衣 clothing library (后台 → 试衣服装).
// The picture is an admin upload; ImageKey/ImageType/ImageSize copy it at
// save time so listing and 试穿 need no asset read per outfit.
type Outfit struct {
	Title        string `json:"title"`
	Category     string `json:"category"`
	Description  string `json:"description"`
	ImageAssetID string `json:"imageAssetId"`
	ImageKey     string `json:"imageKey,omitempty"`
	ImageType    string `json:"imageType,omitempty"`
	ImageSize    int64  `json:"imageSize,omitempty"`
	Published    bool   `json:"published"`
	Deleted      bool   `json:"deleted,omitempty"`
	Sort         int    `json:"sort"`
}

// Clean trims the text fields and checks their lengths.
func (o *Outfit) Clean() error {
	o.Title, o.Category, o.Description = strings.TrimSpace(o.Title), strings.TrimSpace(o.Category), strings.TrimSpace(o.Description)
	switch {
	case o.Title == "":
		return errors.New("请填写服装名称")
	case utf8.RuneCountInString(o.Title) > 40:
		return errors.New("服装名称不超过 40 字")
	case utf8.RuneCountInString(o.Category) > 12:
		return errors.New("分类不超过 12 字")
	case utf8.RuneCountInString(o.Description) > 200:
		return errors.New("描述不超过 200 字")
	case o.ImageAssetID == "":
		return errors.New("请上传服装图片")
	case o.Sort < 0 || o.Sort > 1000000:
		return errors.New("排序值无效")
	}
	return nil
}
