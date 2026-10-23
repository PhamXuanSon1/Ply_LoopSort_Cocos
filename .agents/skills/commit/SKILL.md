---
name: commit
description: Execute semantic git commits with individual file staging, prefix selection, and split-commit enforcement. Use when committing code, managing git history, or when user mentions git/commit/push.
---

# Git Semantic Commit Skill (Antigravity)

Kỹ năng thực hiện semantic git commit với quy trình kiểm soát chặt chẽ: staging từng file, lựa chọn commit prefix chuẩn xác, chia nhỏ commit theo mục đích và xác nhận trước khi thực hiện.

## Điều cấm (Prohibitions)

- **TUYỆT ĐỐI KHÔNG** dùng `git add -A` hoặc `git add .` (ngoại trừ khi cập nhật hàng loạt package như `pnpx changeset version`).
- **KHÔNG** đưa watermark hoặc attribution của AI vào commit message (ví dụ: `Generated with...`, `Co-Authored-By:...`).
- **KHÔNG** gộp nhiều thay đổi không liên quan vào cùng một commit (phải tách commit khi có nhiều mục đích khác nhau).
- **KHÔNG** dùng commit message chung chung, mơ hồ (ví dụ: `update files`, `fix stuff`, `changes`, `wip`).

## Quy trình thực hiện (Workflow)

Theo dõi tiến độ theo checklist:

Task Progress:
- [ ] Step 1: Kiểm tra trạng thái Git (`git status`, `git diff`)
- [ ] Step 2: Phân tích thay đổi & phân nhóm file
- [ ] Step 3: Chọn Prefix chuẩn & soạn thảo commit message
- [ ] Step 4: Trình bày kế hoạch commit cho người dùng xem trước
- [ ] Step 5: Dùng công cụ `ask_question` để người dùng xác nhận
- [ ] Step 6: Chạy lệnh `git add` từng file & thực thi commit
- [ ] Step 7: Báo cáo kết quả commit

---

### Step 1: Kiểm tra trạng thái

Chạy các lệnh terminal qua `run_command`:
```powershell
git status
git diff --stat
git diff
git log --oneline -5
```

### Step 2: Phân tích thay đổi & phân nhóm file

Phân loại các file thay đổi theo mục đích cụ thể:
- Logic gameplay / code triển khai
- Prefabs / Scenes / Assets cấu hình
- Resource (Sprites, Sounds, Models, Materials)
- Tài liệu / Config dự án

> [!IMPORTANT]
> Nếu phát hiện có nhiều mục đích thay đổi không liên quan (ví dụ vừa thêm tính năng mới, vừa sửa bug cũ, vừa cập nhật doc), **bắt buộc phải đề xuất chia nhỏ thành nhiều commit riêng biệt**.

### Step 3: Chọn Prefix & Soạn Commit Message

Tra cứu bảng danh sách Prefix chuẩn tại [prefix-reference.md](prefix-reference.md).

**Định dạng commit message**:
```
<type>(<scope>): <subject>

<body>
```
- `<type>`: Chọn từ [prefix-reference.md](prefix-reference.md) (feat, fix, update, add, chore, refactor, v.v.)
- `<scope>`: Phạm vi ảnh hưởng (tùy chọn, ví dụ: `car`, `gameplay`, `ui`, `assets`)
- `<subject>`: Ngắn gọn, dưới 50 ký tự, mô tả rõ việc đã làm
- `<body>`: Mô tả chi tiết lý do và nội dung thay đổi (nếu cần thiết)

### Step 4: Trình bày cho người dùng

Hiển thị rõ ràng cho người dùng:
1. Danh sách file sẽ stage cho commit này.
2. Commit message dự kiến (`type`, `scope`, `subject`, `body`).
3. Đề xuất các commit tiếp theo nếu cần chia nhỏ.

### Step 5: Xác nhận với người dùng qua `ask_question`

Gọi tool `ask_question` để người dùng chọn:
- Option 1: "(Recommended) Đồng ý, tiến hành commit"
- Option 2: "Chưa commit, cần điều chỉnh lại commit message hoặc danh sách file"

### Step 6: Stage từng file & Thực thi Commit

Thực hiện stage từng file cụ thể (tương thích cả PowerShell / Bash / CMD):
```powershell
git add path/to/file1.ts
git add path/to/file2.prefab
git commit -m "<type>(<scope>): <subject>" -m "<body>"
```
*(Dùng nhiều tham số `-m` để đảm bảo xuống dòng chuẩn xác trên mọi OS mà không bị lỗi cú pháp shell)*

### Step 7: Báo cáo kết quả

Sau khi commit hoàn tất, hiển thị:
- Commit hash ngắn (short hash)
- Commit message đã tạo
- Số lượng file đã commit
- Trạng thái branch hiện tại (`git status -s`)

---

## Cảnh báo & Hủy bỏ

Dừng lại và yêu cầu người dùng xác nhận nếu:
- Phát hiện thao tác có nguy cơ stage nhầm file tạm / file rác không mong muốn.
- Không thể xác định rõ ràng mục đích của các thay đổi.
