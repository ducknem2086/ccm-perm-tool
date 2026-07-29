## yêu cầu cho tool ccm
- chạy bằng nodejs ( port 2345)
- chuyên để test request và response của api
- mock postman , có thể test các request và response của api
- Các thông tin cần cấu hình để chạy tool :
- các ô nhập fromdate, todate
- các ô nhập param 
- phần token (mặc định bấm nút reload để gắn token vào header )
- phần hiển thị request và response (hiển thị dưới dạng bảng ,
có thể export ra file excel) . Với phần hiển thị này thì cho phép hiển thị các cột như sau : 
+ index 
+ request (header, url,param) 
+ response body / error 
+ status code / error code 
+ thời gian request
- và bộ select filter cho các cột hiển thị (có thể filter theo status code, error code, thời gian request - cái này là number input)

## Phần param sẽ có các ô với các thiết lập như sau : 
from date - to date : nhập vào input daterange 
(format dd/mm/yyyy-dd/mm/yyyy ứng với fromDate và toDate)

## sample api hiện tại cần bạn phân tích : 
https://abc.vn/DataAggregationEngine/query/abc-information/:msisdn?fromDate=25032026&toDate=01042026
- trong đó : 
https://abc.vn/  -> domain
query/abc-information/ -> path
:msisdn -> param số điện thoại 
?fromDate=25032026&toDate=01042026 -> query string param, cụ thể
với case này là fromDate và toDate, định dạng ddMMyyyy

## các yêu cầu thêm 
- tool có thể nhận đầu vào là 1 danh sách các api, với các phần dữ cấu hình đầu vào có quan hệ như sau:
+ domain-path : 1-n
+ path-param : n-n
+ query string param : n-n
+ phone param : 1 phone param -> n-n (path-param)
+ Phần nhận số điện thoại có thể là nhập 1 số , hoặc import 
file excel/csv/txt cho nhiều số hoặc 1 số bất kỳ . Áp dụng cho cả các endpoint path nhận vào. 
+ domain và token thì chỉ cần nhập 1 , với domain được load trực tiếp từ local storage hiện tại hoặc cookie (nó là bearer token  và key ở cookie là access_token). Chỗ token này có thể tự load nếu có thể load được hoặc là ô input để nhập vào .
+ có cơ chế để test tất cả các api với list các path được import hoặc nhập vào. 
+ app chỉ gồm 1 màn hình ui duy nhất , nhưng có 2 phần là "input" và "output". 
