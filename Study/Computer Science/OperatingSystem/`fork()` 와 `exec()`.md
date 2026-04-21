```table-of-contents
```
## 프로세스의 메모리 영역 (4가지)

```
┌─────────────────┐  높은 주소
│     Stack       │  (함수 호출, 지역 변수)
│        ↓        │
├─────────────────┤
│                 │  (미할당 공간)
│        ↑        │
│     Heap        │  (동적 할당)
├─────────────────┤
│     Data        │  (초기화된 전역변수)
│                 │
│     BSS         │  (초기화 안 된 전역변수)
├─────────────────┤
│     Text        │  (실행 코드)
└─────────────────┘  낮은 주소
```

**각 영역의 역할**:

- **Text (코드)**: CPU가 실행할 명령어들
- **Data**: `int global = 10;` 같은 초기값이 있는 전역변수
- **BSS**: 초기값이 없는 전역변수 (할당만 되고 0으로 초기화)
- **Heap**: `malloc()`으로 동적 할당하는 메모리
- **Stack**: 함수 호출 시 만들어지는 로컬 변수, 함수 복귀 주소

## fork() 이해하기
**역할**: 현재 프로세스를 정확히 복사하여 **새로운 프로세스를 만든다**

```c
pid_t fork(void);
```

### 동작 과정

```
부모 프로세스 실행 중
        ↓
    fork() 호출
        ↓
    ┌───────────────────────────────┐
    │  부모 메모리 완전 복사!        │
    │  Text, Data, Stack 모두       │
    │  (하지만 공유 가능한 부분도)   │
    └───────────────────────────────┘
        ↓
    ┌─────────────┐     ┌─────────────┐
    │ 부모 프로세스│     │ 자식 프로세스│  (새로 생성)
    │ (계속 실행) │     │ (똑같이 시작)│
    └─────────────┘     └─────────────┘
```

### 코드 예시

```c
#include <stdio.h>
#include <unistd.h>

int main() {
    int x = 100;
    
    pid_t pid = fork();  // 여기서 복제 발생!
    
    // 이 아래부터는 부모와 자식이 별개로 실행
    
    if (pid == 0) {
        // 자식 프로세스 영역 (pid == 0)
        printf("자식: x = %d\n", x);
        x = 200;
        printf("자식: x를 200으로 변경\n");
        printf("자식: x = %d\n", x);
    }
    else if (pid > 0) {
        // 부모 프로세스 영역 (pid > 0, 자식의 PID)
        printf("부모: x = %d\n", x);
        sleep(1);  // 자식이 끝날 때까지 대기
        printf("부모: x = %d (변경 안 됨)\n", x);
    }
    
    return 0;
}
```

**출력 결과**:

```
자식: x = 100
부모: x = 100
자식: x를 200으로 변경
자식: x = 200
부모: x = 100 (변경 안 됨)
```

**중요**: 자식이 x를 200으로 바꾸어도 부모의 x는 여전히 100! (사용하는 메모리 완전 분리)

### fork() 반환값 정리
- 부모 프로세스에서 : `pid` > 0 (자식의 프로세스 ID)
- 자식 프로세스에서  : `pid` == 0
- 실패 => `pid` == -1

## Copy-on-Write (CoW): `fork()` 최적화 기법\
**등장 배경**
- `fork()` 는 비싸다 <- [[프로그래밍에서의 비쌈, 무거움]]

만약 프로세스가 1GB의 메모리를 사용하고 있다면?
```
fork() 호출
  ↓
1GB 메모리 모두 복사???  ← 매우 오래 걸림! (수 초)
```

**해결책**
- 필요해지면 복사 -> `CoW`

**Copy-on-Write 기본 개념**:
```
fork() 직후:
┌─────────────────────┐
│ 부모 메모리 (1GB)   │
│  ↑  ↑  ↑ 포인터로 공유
│  │  │  │
└─┼──┼──┼─────────────┐
  │  │  │ 자식 메모리 │
  └──┴──┴─────────────┘
  (실제 복사는 안 함!)

자식이 변수를 수정하려고 할 때:
├─ 수정하려는 부분만 복사
└─ 그 부분을 자식 메모리에 기록
```

**이점**
- fork() 속도 대폭 단축 (밀리초 단위)
- 메모리 사용량 감소
- 자주 사용하는 기능 (읽기만 할 때는 완전히 빠름)

## exec() 이해하기
**역할**: 현재 프로세스의 메모리를 **새로운 프로그램으로 완전히 대체**
```c
int execv(const char *pathname, char *const argv[]);
```

### 동작 과정
```
exec("/bin/ls") 호출
        ↓
    현재 메모리 상태
    ┌──────────────┐
    │ Text (A코드) │
    │ Data         │
    │ Stack        │
    └──────────────┘
        ↓
    모든 영역을 "ls" 프로그램으로 덮어쓰기
        ↓
    새로운 메모리 상태
    ┌──────────────┐
    │ Text (ls)    │  ← 완전히 다른 코드
    │ Data         │  ← 완전히 다른 데이터
    │ Stack        │  ← 초기화됨
    └──────────────┘
```

### 특징
 **1: 절대 반환하지 않는다**
```c
int main() {
    printf("Before exec\n");
    
    char *argv[] = { "/bin/ls", "-la", NULL };
    execv("/bin/ls", argv);
    
    printf("After exec\n");  // ← 절대 실행 안 됨!
    
    return 0;
}
```

출력:
```
Before exec
(ls의 출력들...)

(After exec는 절대 출력 안 됨)
```
**이유**: exec() 호출 이후는 **다른 프로그램이 실행 중**이므로 원래 프로그램의 코드는 메모리에 없음

2. **PID는 변하지 않음**
```
프로세스 ID: 1234

exec("/bin/ls") 전:  PID = 1234, 프로그램 = A
exec("/bin/ls") 후:  PID = 1234, 프로그램 = ls  ← PID는 같음!
```

---

##  fork() + exec() = 프로세스 생성의 정석

### 왜 둘을 함께 쓸까?

쉘에서 `ls` 명령어를 입력하면 어떻게 될까?
```
쉘 프로세스 실행 중 (PID 1000)

사용자 입력: ls
        ↓
    fork() 호출
        ↓
┌──────────────────┐    ┌──────────────────┐
│ 쉘 (PID 1000)    │    │ 쉘의 복사본 (PID 1001)
│ (계속 대기)      │    │ exec("/bin/ls") 호출
└──────────────────┘    └────────→ ls 프로그램으로 변환
                        ↓
                    ┌──────────────────┐
                    │ ls 실행 (PID 1001)│
                    │ (파일 목록 출력)  │
                    └──────────────────┘
                        ↓
                    프로세스 종료
                        ↓
                    쉘이 다시 입력 대기
```

### 간단한 쉘 구현

```c
#include <stdio.h>
#include <unistd.h>
#include <sys/wait.h>
#include <string.h>

int main() {
    char command[256];
    pid_t pid;
    
    while (1) {
        printf("$ ");  // 프롬프트
        fgets(command, sizeof(command), stdin);
        
        // 개행 문자 제거
        command[strlen(command) - 1] = '\0';
        
        pid = fork();
        
        if (pid == 0) {
            // 자식 프로세스
            execlp(command, command, NULL);
            perror("exec failed");
            exit(1);
        }
        else {
            // 부모 프로세스 (쉘)
            wait(NULL);  // 자식이 끝날 때까지 대기
        }
    }
    
    return 0;
}
```

**동작**:
1. 쉘이 프롬프트 출력
2. 사용자가 명령어 입력 (예: `ls`)
3. fork()로 자식 프로세스 생성
4. 자식에서 exec()로 `ls` 실행
5. 부모(쉘)는 wait()로 자식 종료 대기
6. 자식 종료 후, 쉘이 다시 프롬프트 출력

---

##  fork()와 exec() 분리의 의미
`spawn()` : `fork` + `exec` -> 한 번에 가능!
```c
// 가상의 spawn() 함수
spawn("/bin/ls");  // fork + exec을 한 번에
```
*그러나 중간에 특정 작업을 실행할 수 없다는 단점이 존재*
*실제로는 중간에 다양한 작업을 실행시켜야 함.*
```c
pid_t pid = fork();

if (pid == 0) {
    // ← fork() 직후, exec() 직전의 "마법의 공간"
    
    // 1. 표준 출력 리다이렉션
    int fd = open("output.txt", O_WRONLY | O_CREAT);
    dup2(fd, STDOUT_FILENO);  // 표준 출력 → 파일로 변경
    close(fd);
    
    // 2. 환경 변수 설정
    setenv("PATH", "/usr/bin:/bin", 1);
    
    // 3. 이제 실행
    execv("/bin/ls", argv);
}
```

**`ls > output.txt`처럼 리다이렉션이 작동하는 원리가 바로 이것!**

## 성능 문제: fork() → exec() 오버헤드
**오버 헤드 발생 원인**
-> 복사 후 복사 내용을 사용하지 않음.

```
fork()
  ↓
1GB 메모리 복사 (또는 Copy-on-Write로 포인터만 복사)
  ↓
exec()
  ↓
방금 복사한 메모리 모두 버림  ← 낭비!
```


**오버헤드 톧아보기**
**1. 페이지 테이블 복사 비용** : CPU 시간 소비, 메모리 오버헤드
```
fork() 내부:
┌─────────────────────────┐
│ 부모의 페이지 테이블    │ (수 MB)
│ (가상 주소 ↔ 물리 주소) │
└──────────┬──────────────┘
           ↓ (복사)
┌──────────────────────────┐
│ 자식의 페이지 테이블     │
│ (같은 내용이지만 다름)   │
└──────────────────────────┘
```


**2. TLB(Translation Lookaside Buffer) 플러시**
```
CPU의 TLB (작은 캐시):
┌──────────────────────────┐
│ 가상 주소 0x1000 → 물리 0x4000
│ 가상 주소 0x2000 → 물리 0x5000
│ ...
└──────────────────────────┘

exec() 호출
  ↓
새로운 프로세스이므로 모든 주소 매핑이 바뀜
  ↓
TLB 모두 무효화
  ↓
다음 메모리 접근마다 새로 조회 필요 (느림!)
```

**3. CPU 캐시 오염**
```
exec() 이전:
L1 Cache: [프로그램 A의 데이터들...]
L2 Cache: [프로그램 A의 더 많은 데이터...]

exec("/bin/ls") 호출
  ↓
새 프로그램 B가 실행됨
  ↓
캐시가 프로그램 A의 데이터로 가득 참
  ↓
프로그램 B가 필요한 데이터가 없음 (Cache Miss 폭증)
  ↓
메모리에서 계속 읽음 (매우 느림)
```

## `7`의 문제 해결 방법 : vfork()와 posix_spawn()

### vfork()
```c
pid_t pid = vfork();

if (pid == 0) {
    // 자식 프로세스
    // ⚠️ 주의: 함수 호출하면 안 됨!
    //          스택이 공유되기 때문
    
    execv("/bin/ls", argv);
    _exit(1);  // 반드시 exit() 호출!
}
```

**vfork()의 특징**
- fork()와 달리 메모리를 아예 복사하지 않음
- 부모와 자식이 메모리 공유
- 자식이 exec()을 호출할 때까지 부모는 대기

**단점**
- 빠르지만, 자식이 메모리를 손대면 부모 프로세스에서 오류가 발생 → **위험!**

### 방법 2: posix_spawn() - 표준 방법
```c
#include <spawn.h>

pid_t pid;
char *argv[] = { "/bin/ls", "-la", NULL };

posix_spawn(&pid, "/bin/ls", NULL, NULL, argv, environ);
wait(NULL);
```

**특징**:

- fork() + exec()과 비슷하지만, 커널이 최적화해서 처리
- 안전하고 표준 (POSIX)
- vfork()의 위험 없음
- 복잡한 설정 필요 없으면 이것 사용!

## 9️⃣ 학부 시험에 자주 나오는 질문

### Q1: fork() 후 몇 개의 프로세스가 있나?

```c
pid_t pid = fork();
printf("PID: %d\n", pid);
```

**답**:

- fork() 호출 전: 1개 (현재 프로세스)
- fork() 호출 후: 2개 (부모 + 자식)
- 이 printf는 부모, 자식이 각각 실행하므로 **2번 출력**됨

### Q2: exec() 후 부모 프로세스는?

```c
pid_t pid = fork();

if (pid == 0) {
    execv("/bin/ls", argv);
}
else {
    // 여기서 부모는?
}
```

**답**: 부모는 계속 실행된다! (자식이 exec()을 했을 뿐)

- 부모는 wait()으로 자식의 종료를 기다림
- 자식은 완전히 다른 프로그램(ls)이 됨

### Q3: exit()와 exec()의 차이?

```
exit():     현재 프로세스 종료
exec():     현재 프로세스의 메모리를 다른 프로그램으로 덮어씀

결과:
├─ exit() 후:     프로세스 더 이상 실행 안 함
└─ exec() 후:     새 프로그램이 같은 PID로 실행됨
```

### Q4: 왜 fork()와 exec()을 분리했을까?

**답**: 중간에 리다이렉션, 환경 변수 설정 등을 할 수 있기 때문!

```c
fork();
if (자식) {
    dup2(fd, STDOUT_FILENO);  // ← 이게 가능!
    exec("/bin/ls");
}
```

이것이 없으면 쉘에서 `ls > output.txt`처럼 리다이렉션을 할 수 없음

---

## 🔟 실습: 간단한 프로그램 작성

### 실습 1: fork() 테스트

```c
#include <stdio.h>
#include <unistd.h>

int main() {
    printf("PID=%d: before fork\n", getpid());
    
    pid_t pid = fork();
    
    printf("PID=%d: after fork, fork returned %d\n", getpid(), pid);
    
    if (pid == 0) {
        printf("Child process (PID=%d)\n", getpid());
    } else {
        printf("Parent process (PID=%d), child PID=%d\n", getpid(), pid);
    }
    
    return 0;
}
```

**실행 결과**:

```
PID=1234: before fork
PID=1234: after fork, fork returned 5678
PID=5678: after fork, fork returned 0
Parent process (PID=1234), child PID=5678
Child process (PID=5678)
```

### 실습 2: fork-exec 조합

```c
#include <stdio.h>
#include <unistd.h>
#include <sys/wait.h>

int main() {
    pid_t pid = fork();
    
    if (pid == 0) {
        // 자식 프로세스
        printf("Child: about to exec date\n");
        
        char *argv[] = { "date", NULL };
        execvp("date", argv);
        
        // 이 아래는 exec 성공 시 실행 안 됨
        perror("exec failed");
        return 1;
    }
    else {
        // 부모 프로세스
        printf("Parent: waiting for child\n");
        
        int status;
        wait(&status);  // 자식이 끝날 때까지 대기
        
        printf("Parent: child finished\n");
    }
    
    return 0;
}
```

**실행 결과**:

```
Parent: waiting for child
Child: about to exec date
Mon Mar 20 14:30:45 KST 2024
Parent: child finished
```

---

## 1️⃣1️⃣ 정리: 핵심 개념 정리표

| 개념         | 설명            | 반환값               |
| ---------- | ------------- | ----------------- |
| **fork()** | 프로세스 복제       | 자식: 0, 부모: 자식 PID |
| **exec()** | 메모리 덮어쓰기      | 성공 시 반환 안 함       |
| **wait()** | 자식 프로세스 종료 대기 | 자식의 종료 상태         |
| **exit()** | 프로세스 종료       | 반환 안 함            |

---

## 1️⃣2️⃣ 추가 학습 자료

### fork() 관련 시스템 콜

```c
pid_t fork(void);              // 프로세스 복제
int execv(const char *path, char *const argv[]);    // 프로그램 실행
int wait(int *status);         // 자식 종료 대기
pid_t waitpid(pid_t pid, ...); // 특정 자식 대기
```

### 자주 헷갈리는 부분

```
❌ 틀린 이해:
fork()가 자식 프로세스만 복제한다?
→ 아니다! 부모를 완전히 복사해서 새 프로세스를 만든다.

❌ 틀린 이해:
exec()를 호출하면 부모도 새 프로그램이 된다?
→ 아니다! 호출한 프로세스만 변경된다.

✅ 올바른 이해:
fork()는 "clone" 같은 것
exec()는 "덮어쓰기" 같은 것
```

---

## 마지막: 면접 준비

### 자주 나오는 면접 질문

**Q: fork()와 exec()을 왜 따로 두었나요?**

A: fork()와 exec() 사이의 "마법의 공간"에서 여러 설정(리다이렉션, 환경변수, 권한 변경 등)을 할 수 있기 때문입니다. 만약 한 명령어로 합쳤다면 이런 유연성이 없어집니다.

**Q: Copy-on-Write는 뭔가요?**

A: fork() 후 실제 메모리를 복사하지 않고, 필요할 때만 복사하는 최적화 기법입니다. 부모와 자식이 메모리를 공유하다가, 수정이 필요하면 그때 복사합니다.

**Q: 왜 쉘에서 명령어를 실행할 때 fork-exec을 사용하나요?**

A: 쉘 프로세스 자체는 계속 실행되어야 하기 때문입니다. fork()로 자식을 만들고, 그 자식에서 exec()로 새 프로그램을 실행합니다. 이렇게 하면 명령어 실행 후에도 쉘은 다음 명령을 받을 수 있습니다.