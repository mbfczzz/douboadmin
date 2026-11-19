package settings

import (
	"reflect"
	"strings"
	"testing"
)

func TestFeedKeywords(t *testing.T) {
	got, err := FeedKeywords(" 美食，探店、美食,\n穿搭 ,, ")
	if err != nil || !reflect.DeepEqual(got, []string{"美食", "探店", "穿搭"}) {
		t.Fatalf("got %v %v", got, err)
	}
	if got, _ := FeedKeywords(""); len(got) != 9 || got[0] != "热门" {
		t.Fatalf("default: %v", got)
	}
	if _, err := FeedKeywords(strings.Repeat("词,", 13) + "a,b,c,d,e,f,g,h,i,j,k,l,m"); err == nil {
		t.Fatal("more than 12 accepted")
	}
	if _, err := FeedKeywords(strings.Repeat("长", 21)); err == nil {
		t.Fatal("over-long keyword accepted")
	}
}
