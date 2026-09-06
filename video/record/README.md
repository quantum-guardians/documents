# 대사별 녹음 (로컬 전용)

소개 영상의 대사 43개를 하나씩 녹음하고, 틀린 대사만 다시 녹음한 뒤 한 파일로
합쳐 내려받는 페이지다. GitHub Pages 에는 올리지 않는다.

```powershell
python -m http.server 8765 --bind 127.0.0.1 --directory video
```

그다음 Chrome 에서 <http://127.0.0.1:8765/record/> 를 연다. `video/` 폴더 전체를
한 서버로 띄워야 발표 화면(`introduction/`)을 같은 origin 으로 불러온다.

- Space: 현재 대사 녹음 시작·정지. 녹음이 시작되면 위 발표 화면이 그 대사
  장면을 처음부터 다시 재생한다.
- ← →: 대사 이동, P: 방금 녹음한 것 다시 듣기, 삭제: 그 대사 녹음본만 삭제.
- 목록의 초록 숫자는 녹음 길이, 주황은 영상 구간보다 긴 경우다. 대사를 고친
  뒤에는 "대사 바뀜" 으로 표시된다.
- 녹음본은 이 브라우저의 IndexedDB 에 남는다. 다른 브라우저나 시크릿 창에서는
  보이지 않는다.

내려받기 세 가지:

- 시간표 위치에 합친 wav: 각 클립을 영상 구간 시작 시각에 놓는다. 구간보다 긴
  클립은 다음 클립과 겹친다.
- 겹치지 않게 밀어서 합친 wav: 앞 클립이 끝나지 않았으면 0.25초 뒤로 민다.
  밀린 시작 시각을 `narration-pushed-starts.json` 으로 같이 내려받는다.
- 대사별 파일 전부: `cue-01.webm` … 형식으로 클립을 하나씩 내려받는다.
- 동영상(webm)으로 내보내기: Chrome 이 이 탭을 캡처하는 동안 발표 화면을
  처음부터 실시간으로 재생하고, "시간표 위치에 합친" 나레이션을 소리로 넣는다.
  화면 선택 창이 뜨면 이 탭을 고른다. 영상 길이만큼 기다리면
  `quantum-guardian-introduction.webm` 을 내려받는다. 녹화 중에는 다른 창을
  위에 띄우지 말고 탭을 바꾸지 않는다.

mp4 가 필요하면:

```powershell
ffmpeg -i quantum-guardian-introduction.webm -c:v libx264 -crf 18 -pix_fmt yuv420p -c:a aac quantum-guardian-introduction.mp4
```
