## yêu cầu thêm từ hệ thống hiện tại :
- ngoài việc import file endpoints , thì tôi còn muốn import thêm file phân quyền 
- hệ thống lúc này sẽ cần thêm 2 mục map fields để truy vấn dữ liệu, trong đó :
+ với file phân quyền : các cột của nó có thể map được với các sheet của file endpoints, ví dụ như cột "role" trong file phân quyền có thể map với sheet "role" trong file endpoints -> tức là map theo name 
+ trong file phân quyền có 1 cột chứa các name , các name này cũng sẽ được map với 1 cột chứa name ở trong file endpoints, ví dụ như cột "name" trong file phân quyền có thể map với cột "name" trong tất cả các sheet , hoặc 1 sheet bất kỳ 
+ nên với mỗi 1 usecase ở trên tương ứng với 1 mục mapping fields .
- với file phân quyền thì các dữ liệu được map theo usecase 1 nó có giá trị x hoặc rỗng . Với giá trị x thì khi request
trả về 403 thì là đúng, còn nếu không phải là 403 thì là sai (nếu auth profile không đúng với keyword của quyền theo sheet name được map). Nếu auth profile đúng với keyword của quyền theo sheet name được map thì khi request trả về 200 thì là đúng, còn nếu không phải là 200 thì là sai.
- Phần output lúc này sẽ thay thế việc trả về time response bằng status như gạch đầu dòng trước đó . tôi đặt tên cho cột 
hiển thị cho phần status này là "status_permission" với 3 giá trị : true/false/empty (với empty là rơi vào ngoài các case của gạch đầu dòng trước đó - tương ứng với catch case )