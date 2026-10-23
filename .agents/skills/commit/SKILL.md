---
name: commit
description: Execute semantic git commits with individual file staging, prefix selection, and strict per-function/feature split commits without asking for confirmation. Use when committing code, managing git history, or when user mentions git/commit/push or types /commit.
---

# Git Semantic Commit Skill (Antigravity)

Kỹ năng thực hiện semantic git commit tự động, chính xác và tách biệt: **luôn luôn commit từng function / tính năng / module riêng biệt**, staging từng file cụ thể và **tự động thực thi ngay lập tức mà không cần hỏi lại người dùng để confirm hay đề xuất lựa chọn**.

## Nguyên tắc cốt lõi (Core Rules)

1. **Tự động thực thi (No interactive prompt)**:
   - **KHÔNG dùng `ask_question`** hay dừng lại để hỏi xác nhận hoặc xin ý kiến đề xuất.
   - Tự động phân tích toàn bộ thay đổi, phân chia thành các nhóm function độc lập và lần lượt commit từng nhóm cho đến khi sạch working tree.

2. **Luôn luôn commit từng function / tính năng riêng biệt**:
   - Tuyệt đối **KHÔNG gộp chung** các thay đổi thuộc nhiều chức năng, mục đích hoặc module khác nhau vào 1 commit.
   - Mỗi function logic, mỗi tính năng gameplay, mỗi thành phần UI, tài nguyên asset hay công cụ cấu hình phải là một commit riêng biệt với scope rõ ràng.

3. **Điều cấm kỵ**:
   - **TUYỆT ĐỐI KHÔNG** dùng `git add -A` hoặc `git add .`. Chỉ stage cụ thể các file liên quan đến function đang commit.
   - **KHÔNG** đưa watermark / attribution của AI vào commit message (ví dụ: `Generated with...`, `Co-Authored-By:...`).
   - **KHÔNG** dùng commit message chung chung, mơ hồ (ví dụ: `update files`, `fix stuff`, `changes`, `wip`).

4. **Ngôn ngữ commit**:
   - Commit message viết bằng **Tiếng Việt** theo chuẩn Semantic Commit.

---

## Quy trình thực hiện tự động (Automated Workflow)

Task Progress:
- [ ] Step 1: Kiểm tra trạng thái Git (`git status`, `git diff --stat`, `git diff`)
- [ ] Step 2: Phân tích thay đổi & bóc tách thành danh sách các function / tính năng riêng biệt
- [ ] Step 3: Với mỗi function / tính năng:
  - Chọn Prefix chuẩn từ [prefix-reference.md](prefix-reference.md)
  - Soạn commit message Tiếng Việt chuẩn ngữ nghĩa: `<type>(<scope>): <subject>` + `<body>`
  - Chạy `git add <file1> <file2>...` chính xác các file thuộc function đó
  - Thực thi commit qua `run_command`
- [ ] Step 4: Báo cáo bảng tổng kết toàn bộ các commit đã thực hiện

---

### Step 1: Kiểm tra trạng thái

```powershell
git status
git diff --stat
git diff
```

### Step 2: Bóc tách từng function / tính năng riêng biệt

Duyệt qua danh sách file và nội dung diff, chia nhỏ các thay đổi theo từng function/tính năng:
- **Function A**: Ví dụ xử lý di chuyển xe (`CarMovement.ts`) -> Commit riêng.
- **Function B**: Ví dụ xử lý đồ họa/skin xe (`CarGraphic.ts`, `CarSkin.ts`) -> Commit riêng.
- **Function C**: Ví dụ xử lý logic dỡ hàng / dỡ khối (`CarController.ts`) -> Commit riêng.
- **Assets / Resources**: Hình ảnh, âm thanh, prefab mới -> Commit riêng theo từng cụm tài nguyên.
- **Tools / Config**: Cấu hình project, tool MCP -> Commit riêng.

### Step 3: Định dạng Commit Message & Thực thi từng function

Tra cứu Prefix tại [prefix-reference.md](prefix-reference.md).

**Cú pháp commit (PowerShell/Cross-platform)**:
```powershell
git add path/to/exact_file1.ts path/to/exact_file2.ts
git commit -m "<type>(<scope>): <tiêu đề ngắn gọn dưới 50 ký tự>" -m "<mô tả chi tiết nội dung đã làm>"
```

Lặp lại việc stage và commit cho từng function một cho đến khi hoàn thành tất cả các thay đổi.

### Step 4: Báo cáo kết quả

Hiển thị bảng tổng kết rõ ràng:
- Danh sách các commit đã tạo (Hash, Message, Số lượng file)
- Trạng thái `git status` cuối cùng (xác nhận working tree clean).
