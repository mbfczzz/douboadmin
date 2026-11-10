package store

// Catalog, generation jobs and media.
func init() {
	register(
		Table{Name: "models", Comment: "生成模型目录；id = 上游模型 id", Cols: []Col{
			{Field: "id", Kind: Key, Name: "model_id"}, c("key", Short), c("name", Short), c("kind", Key), c("icon", Text),
			c("published", Bool), c("available", Bool), c("deleted", Bool), c("sort", Int),
			c("points", Float), c("creditCost", Float), c("recentJobs", Int), c("syncedAt", Short),
			c("referenceTypes", JSON), c("resolutions", JSON), c("ratios", JSON), c("durations", JSON),
			c("qualities", JSON), c("modes", JSON), c("operations", JSON), c("resolutionByMode", JSON),
			c("referenceRules", JSON), c("paramsSchema", JSON), c("priceModifiers", JSON), c("settings", JSON),
		}},
		Table{Name: "templates", Comment: "创作模板", Cols: []Col{
			c("title", Short), c("category", Short), c("kind", Key), c("family", Key), c("model", Key),
			c("mode", Key), c("resolution", Key), c("ratio", Key), c("duration", Int), c("quality", Key),
			c("cover", Text), c("coverAssetId", Key), c("preview", Text), c("prompt", Text), c("description", Text),
			c("requiredImages", Int), c("published", Bool), c("deleted", Bool), c("sort", Int),
		}},
		Table{Name: "assets", Comment: "上传文件与生成结果文件", Owner: "上传者或任务所属用户", Cols: []Col{
			c("name", Short), c("url", Text), c("key", Text), c("type", Short), c("size", Int),
			c("sourceUrl", Text), c("sourceVideoId", Key),
		}},
		Table{Name: "executions", Comment: "生成任务在上游的执行状态；id = 任务 id", Cols: []Col{
			c("phase", Key), c("modelKey", Short), c("taskId", Short), c("startedAt", Time),
			c("estimatedCostMicros", Int), c("result", Long), c("error", Text), c("errorCause", Text), c("note", Text),
		}},
		Table{Name: "job_progress", Comment: "生成任务当前阶段说明；id = 任务 id", Owner: "用户", Cols: []Col{
			c("stage", Short),
		}},
		Table{Name: "job_billing", Comment: "生成任务计费（预留/结算/退回）；id = 任务 id", Owner: "用户", Cols: []Col{
			c("units", Int), c("state", Key), c("estimatedCostMicros", Int),
		}},
		Table{Name: "work_meta", Comment: "作品标题与删除标记；id = 任务 id", Owner: "用户", Cols: []Col{
			c("title", Short), c("deleted", Bool), c("deletedAt", Time),
		}},
		Table{Name: "shares", Comment: "作品分享链接；id = 分享令牌", Owner: "用户", Cols: []Col{
			c("jobId", Key), c("title", Short), c("showPrompt", Bool), c("expiresAt", Time),
		}},
		Table{Name: "hot_videos", Comment: "抖音视频信息；id = 视频 id", Cols: []Col{
			{Field: "id", Kind: Key, Name: "video_id"}, c("title", Text), c("text", Text), c("author", Short),
			c("cover", Text), c("url", Text), c("sourceUrl", Text), c("likes", Int), c("views", Int),
			c("comments", Int), c("publishedAt", Time), c("duration", Float),
		}},
		Table{Name: "hot_cache", Comment: "抖音搜索结果与热词缓存；id = 查询摘要", Cols: []Col{
			c("items", JSON), c("words", JSON), c("cursor", Int), c("hasMore", Bool), c("searchId", Text),
			c("backtrace", Text), c("sortScope", Key), c("cached", Bool), c("fetchedAt", Time),
		}},
	)
}
