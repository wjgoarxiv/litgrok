<p align="center"><picture><source media="(prefers-reduced-motion: reduce)" srcset="https://cdn.jsdelivr.net/npm/@litfamily/litgrok@1.0.10/docs/assets/cover-motion-still.webp" /><source media="(prefers-reduced-motion: no-preference)" srcset="https://cdn.jsdelivr.net/npm/@litfamily/litgrok@1.0.10/docs/assets/cover-motion.webp" /><img src="https://cdn.jsdelivr.net/npm/@litfamily/litgrok@1.0.10/docs/assets/cover-motion.webp" width="100%" alt="LitFamily 모션 커버: 다섯 로봇 패널이 차례로 켜지고, LitGrok 로봇의 눈과 테두리가 빛난 뒤 LITFAMILY와 KEEP THE WORK LIT. 문구가 밝아지는 영상" /></picture></p>

<h1 align="center">LitGrok</h1>
<p align="center"><strong>Keep the work lit.</strong></p>

Grok Build에서 작은 결과물을 만들고, 확인한 내용과 다음 할 일을 프로젝트에 남기세요.

**[GitHub에서 전체 안내와 스킬 갤러리 보기](https://github.com/wjgoarxiv/litgrok/blob/main/README_ko-KR.md)** · [English](https://github.com/wjgoarxiv/litgrok#readme) · [설치](#30초-설치) · [상세 안내](https://cdn.jsdelivr.net/npm/@litfamily/litgrok@1.0.10/docs/reference_ko-KR.md)

<p align="center">
<a href="#30초-설치"><img src="https://cdn.jsdelivr.net/npm/@litfamily/litgrok@1.0.10/docs/assets/readme/badge-version.svg" alt="1.0.10" /></a>
<a href="https://cdn.jsdelivr.net/npm/@litfamily/litgrok@1.0.10/LICENSE"><img src="https://cdn.jsdelivr.net/npm/@litfamily/litgrok@1.0.10/docs/assets/readme/badge-license.svg" alt="MIT 라이선스" /></a>
</p>

<p align="center"><a href="https://cdn.jsdelivr.net/npm/@litfamily/litgrok@1.0.10/docs/reference_ko-KR.md"><img src="https://cdn.jsdelivr.net/npm/@litfamily/litgrok@1.0.10/docs/assets/readme/lucide-book-open.svg" width="16" alt="" /> 상세 안내</a> &nbsp; <a href="#30초-설치">설치</a> &nbsp; <a href="https://cdn.jsdelivr.net/npm/@litfamily/litgrok@1.0.10/docs/assets/cover-motion.webp"><img src="https://cdn.jsdelivr.net/npm/@litfamily/litgrok@1.0.10/docs/assets/readme/lucide-play.svg" width="16" alt="" /> 커버 모션</a> &nbsp; <a href="https://cdn.jsdelivr.net/npm/@litfamily/litgrok@1.0.10/LICENSE"><img src="https://cdn.jsdelivr.net/npm/@litfamily/litgrok@1.0.10/docs/assets/readme/lucide-shield-check.svg" width="16" alt="" /> MIT</a></p>

LitGrok은 Grok Build 위에 일하는 방식을 얹습니다. 계획하고, 만들고, 확인하고, 다음 세션이 읽을 인수인계 문서를 남기는 방식입니다. 스킬 38개, 에이전트 11개, 프로젝트 규칙 하나, 훅 등록 열한 개가 들어 있고, 세션 실행과 모델 선택은 계속 Grok Build가 맡습니다.

## 30초 설치

Node.js와 Grok Build가 있으면 됩니다. 써 보고 싶은 프로젝트에서 대화형 터미널을 열고 실행하세요.

```bash
npm exec --yes --package @litfamily/litgrok@latest -- litgrok install
```

파일은 `<project>/.grok/`에 들어갑니다. `~/.grok/`에 설치하려면 `--user`를, 이 릴리스로 고정하려면 `--package @litfamily/litgrok@1.0.10`을 쓰세요. `--dry-run`을 붙이면 파일을 쓰기 전에 들어갈 경로를 모두 보여 줍니다.

로컬 패키지로 써 보려면 실제 절대 경로를 변수에 넣고 두 줄을 따로 실행하세요.

```bash
LITGROK_PACK='/absolute/path/to/the-provided-package.tgz'
npm exec --yes --package "$LITGROK_PACK" -- litgrok install
```

## 처음 입력해 볼 것

프로젝트의 Git 루트에서 Grok Build를 열거나 다시 시작하고, `/hooks-trust`에서 훅을 살펴본 뒤 신뢰하세요. 관찰된 Grok Build 1.0.23에서는 `grok --trust inspect --json`도 쓸 수 있습니다. 일반 폴더에서도 스킬과 규칙은 불러오지만 훅은 잡히지 않을 수 있습니다. 그다음 이렇게 보내 보세요.

```text
/litwork 외부 의존성 없이 index.html 하나로 할 일 목록을 만들어줘. 추가·완료·삭제 동작을 구현하고, 확인한 내용과 다음 할 일을 남겨줘. 브라우저를 자동으로 열지 말고 내가 확인할 순서를 알려줘.
```

만들어진 `index.html`을 직접 열어 항목을 추가하고, 완료로 표시하고, 지워 보세요. 돌려 보지 못한 검사는 미확인으로 남겨 두세요.

## 다음 세션으로 이어 가기

큰 변경이라면 `/lit-plan`으로 계획을 만들고, 저장된 계획을 읽어 본 뒤 `/start-work <plan path>`를 실행하세요. 멈추기 전에는 이렇게 요청합니다.

```text
/lit-handoff 지금까지 만든 것, 확인한 것, 남은 일을 기록하고 저장 경로를 알려줘.
```

다음 세션에서는 돌려받은 경로를 Grok Build에 알려 주고, 그 문서를 읽은 뒤 현재 파일 상태부터 확인하라고 요청하세요. 인수인계 문서가 있다고 작업이 저절로 이어지지는 않습니다.

## 자주 쓰는 명령

| 이렇게 입력하면 | 일어나는 일 |
| --- | --- |
| `/litwork` | 범위가 정해진 작업에 쓸 체크리스트를 시작합니다. |
| `handoff` 또는 `/lit-handoff` | 확인한 결과와 다음 할 일을 다음 세션으로 건넵니다. |
| `/lit-plan` | 확인 기준이 붙은 계획을 씁니다. |
| `/start-work <승인된 계획>` | 승인한 계획을 실행합니다. |
| `/review-work` | 변경 사항과 그 근거를 검토합니다. |
| `/litresearch` | 출처를 따라갈 수 있는 범위 안에서 조사하고, 근거보다 크게 말하지 않습니다. |

세션이 불러온 전체 목록은 `/skills`에서 보입니다. [GitHub의 스킬 갤러리](https://github.com/wjgoarxiv/litgrok/blob/main/README_ko-KR.md#스킬-한눈에-보기)에서는 38개 스킬을 결과 그림과 함께 볼 수 있습니다.

코드 밖의 일도 있습니다. `lit-pptx`는 발표자료를, `lit-docx`는 보고서와 Word 문서를 만들고, `/frontend-ui-ux`는 화면을 만들어 확인하며, `/readme-studio`는 저장소 사실에 근거한 README를 씁니다. `lit-humanizer`는 딱딱한 한국어나 영어 문장을 다시 씁니다.

## 설치하면 달라지는 것

설치 프로그램이 스킬, 에이전트, 프로젝트 규칙, 훅을 `.grok/`에 복사합니다. [`hooks/hooks.json`](https://cdn.jsdelivr.net/npm/@litfamily/litgrok@1.0.10/hooks/hooks.json)에 있는 훅 등록 열한 개는 신뢰한 Git 루트에서만 동작하고, `.grok/litgrok/session-ledger/`에 이벤트 순서를 남깁니다. LitGrok이 백그라운드 작업을 예약하거나 세션이 끝난 뒤에 일을 이어 가지는 않습니다.

원하면 `install --user --status-line`으로 사용자 범위에 상태 행을 켤 수 있습니다. `~/.grok/config.toml`에 `[ui.status_line]`을 추가하며, 파일이 이미 있으면 먼저 백업합니다.

## 안전과 제거

설치 프로그램은 파일을 업데이트하거나 지우기 전에 자기가 설치한 파일인지 확인하고, 사용자가 고친 파일이나 다른 곳에서 온 파일, 안전하지 않은 경로는 덮어쓰지 않습니다. `CI`, `NO_COLOR`(값이 비어 있어도), `--no-color`, `--dry-run`은 `--yes`를 붙여도 파일을 쓰지 않는 미리보기입니다. `--yes` 없이 비대화형으로 실행해도 미리보기로 끝납니다.

설치할 때와 같은 범위로 제거하세요.

```bash
npm exec --yes --package @litfamily/litgrok@latest -- litgrok uninstall
npm exec --yes --package @litfamily/litgrok@latest -- litgrok uninstall --user
```

설치 프로그램은 `git init`을 실행하거나 훅을 대신 신뢰하지 않고, 로그인 상태나 API 키를 쓰지 않으며, 모델도 고르지 않습니다. 패키지 테스트가 통과했다고 실제 Grok에서도 그렇게 동작한다는 뜻은 아닙니다. 저장소 루트에서 직접 연 세션으로 `/hooks`와 `grok inspect --json`을 확인하세요.

## 잘 안 될 때

- **훅이 보이지 않을 때:** 훅은 신뢰한 Git 프로젝트 루트가 있어야 잡힙니다. 새 프로젝트라면 신뢰하기 전에 직접 `git init`을 실행하고, 기존 저장소라면 실제 루트에서 Grok Build를 여세요.
- **파일이 쓰이지 않았을 때:** 위의 미리보기 조건 가운데 하나에 걸린 것입니다. 설치 메시지에서 파일이 실제로 쓰였는지 확인하세요.
- **상태 행이 보이지 않을 때:** 상태 행은 사용자나 관리자 설정에서 옵니다. Grok은 프로젝트나 플러그인 설정에서는 이 값을 읽지 않습니다.

---

**[GitHub에서 전체 안내, 스킬 갤러리, 문제 해결 보기 →](https://github.com/wjgoarxiv/litgrok/blob/main/README_ko-KR.md)**

[상세 안내](https://cdn.jsdelivr.net/npm/@litfamily/litgrok@1.0.10/docs/reference_ko-KR.md) · [변경 이력](https://cdn.jsdelivr.net/npm/@litfamily/litgrok@1.0.10/CHANGELOG.md) · [개인정보](https://cdn.jsdelivr.net/npm/@litfamily/litgrok@1.0.10/docs/privacy.md) · [MIT 라이선스](https://cdn.jsdelivr.net/npm/@litfamily/litgrok@1.0.10/LICENSE)

커버의 모션은 LitFamily 모션 스킬로 만든 브랜드 연출이며, 실제 Grok 작업 실행을 녹화한 영상이 아닙니다.
