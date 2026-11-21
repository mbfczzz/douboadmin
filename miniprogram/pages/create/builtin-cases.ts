// Built-in 案例 for 剧情带货 / 探店视频: each has a product or store photo
// (media/ui-art/<id>.jpg, the user's @图片1 after 做同款) and a frame of the
// finished video as its cover (<id>-cover.jpg), both drawn with Codex.
// The description is written for that photo; the user can swap either.
export type BuiltinCase = { id: string; title: string; prompt: string };

export const BUILTIN_CASES: Record<"ad" | "shop", BuiltinCase[]> = {
  ad: [
    { id: "case-ad-lipstick", title: "约会前补妆", prompt: "闺蜜约会前在咖啡馆补妆，女生从包里拿出@图片1中的口红，镜头特写涂抹上色，再拉远到她对镜一笑，闺蜜凑过来问色号，最后口红立在桌面特写，柔和暖光。" },
    { id: "case-ad-thermos", title: "打工人早八", prompt: "清晨地铁站，打工人一手拿着@图片1中的保温杯，打开杯盖冒出热气，镜头跟随走进办公室，坐下喝一口露出满足表情，最后保温杯放在键盘旁特写，明亮通透。" },
    { id: "case-ad-sneaker", title: "雨天通勤不湿鞋", prompt: "下雨的街头，年轻人穿着@图片1中的运动鞋踩过水洼，慢镜头水花溅起，鞋面依旧干净，镜头从鞋子跟拍到全身轻快奔跑，最后鞋子侧面特写，清新色调。" },
    { id: "case-ad-serum", title: "熬夜后的急救", prompt: "深夜台灯下，女生加班后揉着眼睛，拿起@图片1中的精华滴在手心，轻拍上脸，转场到第二天清晨，她对着镜子皮肤透亮，最后精华瓶特写在晨光里。" },
    { id: "case-ad-nuts", title: "追剧零食", prompt: "周末沙发上，两个朋友追剧，撕开@图片1中的坚果袋倒出一把，镜头特写坚果饱满酥脆，两人边吃边笑，最后坚果袋放在茶几上特写，温馨居家氛围。" },
    { id: "case-ad-earbuds", title: "地铁降噪", prompt: "拥挤嘈杂的地铁车厢，女生打开@图片1中的耳机盒戴上耳机，画面声音瞬间安静，她闭眼享受音乐，周围人群虚化，最后耳机和充电盒特写，都市冷暖对比色。" },
    { id: "case-ad-tote", title: "周末出游", prompt: "周末阳光公园，女生背着@图片1中的帆布包出门，镜头展示包里装下水杯、相机和外套，她在草地上野餐拍照，最后帆布包挂在肩上特写，明亮清新。" },
    { id: "case-ad-pan", title: "新手做饭不粘锅", prompt: "厨房里新手小哥第一次煎蛋，用@图片1中的不粘锅倒油打蛋，镜头特写蛋饼轻松滑动不粘底，他得意地翻面装盘，最后平底锅特写，温暖家庭感。" },
  ],
  shop: [
    { id: "case-shop-milktea", title: "奶茶店打卡", prompt: "女生推门走进@图片1中的奶茶店，镜头扫过柜台和菜单，店员摇制奶茶，特写珍珠和奶盖，她接过奶茶喝一口比心，最后店内暖光全景。" },
    { id: "case-shop-hotpot", title: "火锅店探店", prompt: "朋友们围坐在@图片1中的火锅店，红汤翻滚冒着热气，特写毛肚七上八下、肥牛涮熟裹满红油，大家举杯碰饮料大笑，最后热闹的店内全景。" },
    { id: "case-shop-cafe", title: "宝藏咖啡馆", prompt: "午后阳光洒进@图片1中的咖啡馆，镜头缓缓推进木桌和绿植，咖啡师拉花特写，女生靠窗看书喝咖啡，最后咖啡馆门口全景，慵懒文艺氛围。" },
    { id: "case-shop-bakery", title: "面包店出炉", prompt: "清晨@图片1中的面包店，烤箱打开热气升腾，特写可颂层层酥脆、掰开拉丝，顾客挑选面包装袋，最后橱窗里摆满面包的全景，暖黄色调。" },
    { id: "case-shop-noodle", title: "巷子面馆", prompt: "老街巷子里@图片1中的面馆，师傅现场拉面下锅，特写牛肉片和红油汤底，食客挑起一筷子面大口吸溜，最后店门口烟火气全景。" },
    { id: "case-shop-flower", title: "花店日常", prompt: "@图片1中的花店清晨开门，店主整理一桶桶鲜花，特写修剪花枝、包扎花束，顾客接过花束微笑，最后花店门口全景，柔和浪漫色调。" },
    { id: "case-shop-bbq", title: "夜市烧烤", prompt: "夜晚@图片1中的烧烤摊灯串亮起，炭火上的肉串滋滋冒油，撒上孜然辣椒特写，朋友们举着串干杯，最后夜市热闹全景。" },
    { id: "case-shop-dessert", title: "甜品店下午茶", prompt: "闺蜜走进@图片1中的甜品店，镜头扫过柜台里的慕斯蛋糕和水果挞，特写叉子切开蛋糕的流心，两人拍照分享，最后粉色店内全景。" },
  ],
};
