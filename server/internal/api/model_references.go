package api

import (
	"doubo/server/internal/core"
	"fmt"
)

func validateModelReferences(m core.Model, mode string, counts map[string]int, sizes map[string][]int64) error {
	s := m.Settings
	for typ, count := range counts {
		maxCount, maxMB := 0.0, 0.0
		if m.Kind == "image" {
			maxCount = float64(s.MaxRefImages)
			maxMB = s.MaxRefImageSizeMB
		}
		if m.Kind == "video" {
			prefix := mode
			if mode == "omni_ref" {
				prefix = "omniRef"
				if allowed, ok := s.OmniReferences[typ]; ok && !allowed {
					return fmt.Errorf("当前模型已关闭此类全能参考素材")
				}
			}
			maxCount = s.RefLimits[prefix+"."+typ+"Count"]
			maxMB = s.RefLimits[prefix+"."+typ+"SizeMB"]
		}
		if maxCount > 0 && float64(count) > maxCount {
			return fmt.Errorf("参考素材超过当前模型的数量限制")
		}
		for _, size := range sizes[typ] {
			if maxMB > 0 && float64(size) > maxMB*1024*1024 {
				return fmt.Errorf("参考素材超过当前模型的大小限制")
			}
		}
	}
	return nil
}
