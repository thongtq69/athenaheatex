"""Structured Vietnamese locale helpers.

Translations are applied to parsed visible text nodes and selected UI
attributes. URLs, scripts, CSS, model numbers and company names are never fed
through the translation map.
"""
import json
import re
from pathlib import Path
from bs4 import BeautifulSoup, NavigableString, Comment, Doctype

VI_PREFIX = "/languages/vi/"
ASSET_PREFIXES = ("/templates/", "/img/", "/upfile/", "/aifeedback/", "/api/", "/languages/al/", "/languages/es/", "/languages/fr/", "/languages/ru/", "/languages/cn/")

TRANSLATIONS = {
    "Description": "Mô tả", "Description:": "Mô tả:", "Parameter": "Thông số", "Parameter:": "Thông số:",
    "Video": "Video", "Contact": "Liên hệ", "Contact Us": "Liên hệ", "Contact us": "Liên hệ",
    "More": "Xem thêm", "Read More": "Xem thêm", "Learn More": "Tìm hiểu thêm", "Details": "Chi tiết",
    "Previous": "Trước", "Previous:": "Trước:", "Next": "Tiếp theo", "Next:": "Tiếp theo:",
    "Related Product": "Sản phẩm liên quan", "Name": "Họ tên", "Country:": "Quốc gia:",
    "Raw material": "Nguyên liệu", "Raw\u00a0material": "Nguyên liệu", "Product": "Sản phẩm",
    "Product\u00a0package": "Quy cách đóng gói", "Capacity": "Công suất", "Capacity range": "Dải công suất",
    "Technical Parameters": "Thông số kỹ thuật", "Main technical parameters": "Thông số kỹ thuật chính",
    "Product performance characteristics": "Đặc tính sản phẩm", "Application": "Ứng dụng",
    "Machinery": "Máy móc", "Complete Line": "Dây chuyền hoàn chỉnh", "Solution": "Giải pháp", "Service": "Dịch vụ",
    "About Us": "Giới thiệu", "About us": "Giới thiệu", "News": "Tin tức", "Products": "Sản phẩm",
    "Company Profile": "Giới thiệu công ty", "Company Culture": "Văn hóa công ty", "Factory Tools": "Thiết bị nhà máy",
    "Quality Control": "Kiểm soát chất lượng", "Why Us": "Vì sao chọn chúng tôi", "More Machinery": "Thêm máy móc",
    "Drop Us A Link!": "Gửi yêu cầu cho chúng tôi!", "Certification": "Chứng nhận", "Submit": "Gửi",
    "Inquiry": "Yêu cầu", "E-mail": "Email", "Email": "Email", "Phone": "Điện thoại", "Address": "Địa chỉ",
    "Tel:": "Điện thoại:", "Fax:": "Fax:", "Mobile:": "Di động:",
    "Aseptic Carton Filling Machine": "Máy chiết rót hộp tiệt trùng", "Aseptic Carton Packaging Material": "Vật liệu đóng gói hộp tiệt trùng",
    "Filling, Packing Machine": "Máy chiết rót và đóng gói", "Stainless Steel Tanks": "Bồn inox", "Preparation system": "Hệ thống chuẩn bị",
    "Sterilization system": "Hệ thống tiệt trùng", "CIP Cleaning System": "Hệ thống vệ sinh CIP", "Fruit Processing Equipment": "Thiết bị chế biến trái cây",
    "Carbonated Beverage Equipment": "Thiết bị đồ uống có ga", "Drinking Water Treatment Equipments": "Thiết bị xử lý nước uống",
    "Sanitary Pumps": "Bơm vệ sinh", "Installation Pipelines, Valves, Fittings": "Lắp đặt đường ống, van và phụ kiện", "Utilities": "Tiện ích",
    "UHT Milk Processing Line": "Dây chuyền xử lý sữa UHT", "Pasteurized Milk Processing Line": "Dây chuyền xử lý sữa thanh trùng",
    "Yogurt Processing Line": "Dây chuyền sản xuất sữa chua", "Milk Powder Processing Line": "Dây chuyền sản xuất sữa bột",
    "Condensed Milk Processing Line": "Dây chuyền sản xuất sữa đặc", "Ice Cream Processing Line": "Dây chuyền sản xuất kem",
    "Cheese Processing Line": "Dây chuyền sản xuất phô mai", "Butter Processing Line": "Dây chuyền sản xuất bơ",
    "Soymilk Processing Line": "Dây chuyền sản xuất sữa đậu nành", "Juice Processing Line": "Dây chuyền sản xuất nước ép",
    "Fruit Processing Line": "Dây chuyền chế biến trái cây", "Tea Drinks Processing Line": "Dây chuyền sản xuất đồ uống trà",
    "Carbonated Drinks Production Line": "Dây chuyền sản xuất đồ uống có ga", "Mineral Water Production Line": "Dây chuyền sản xuất nước khoáng",
    "Pure Water processing Line": "Dây chuyền xử lý nước tinh khiết", "Dairy product solution": "Giải pháp sản phẩm sữa",
    "Juice solution": "Giải pháp nước ép", "Carbonated drinks solution": "Giải pháp đồ uống có ga", "Drinking water solution": "Giải pháp nước uống",
    "The Small Scale Milk, Yoghurt, Juice Combined Production Line": "Dây chuyền kết hợp sữa, sữa chua và nước ép quy mô nhỏ",
    "Complete Dây chuyền xử lý sữa UHT": "Dây chuyền xử lý sữa UHT", "Complete Dây chuyền xử lý sữa thanh trùng": "Dây chuyền xử lý sữa thanh trùng",
    "Complete Dây chuyền sản xuất sữa chua": "Dây chuyền sản xuất sữa chua", "Complete Milk Powder Processing line": "Dây chuyền sản xuất sữa bột",
    "Complete Dây chuyền sản xuất nước ép": "Dây chuyền sản xuất nước ép", "Complete Fruit Dây chuyền sản xuất nước ép": "Dây chuyền chế biến trái cây",
    "Complete Dây chuyền sản xuất đồ uống trà": "Dây chuyền sản xuất đồ uống trà", "Complete Carbonated Processing Line": "Dây chuyền sản xuất đồ uống có ga",
    "Complete Mineral Water processing Line": "Dây chuyền sản xuất nước khoáng", "Complete Pure Water Processing Line": "Dây chuyền xử lý nước tinh khiết",
    "Whole UHT milk processing plant including:": "Nhà máy xử lý sữa UHT hoàn chỉnh bao gồm:",
    "2.Milk Receiving or powder dissolving Section": "2. Khu tiếp nhận sữa hoặc hòa tan sữa bột",
    "5.UHT Milk Filling & Packaging Section": "5. Khu chiết rót và đóng gói sữa UHT",
    "1.Water Treatment section:": "1. Khu xử lý nước:", "3.Preparation Section": "3. Khu chuẩn bị", "4.UHT Sterilization Section": "4. Khu tiệt trùng UHT",
    "6.CIP Cleaning Section": "6. Khu vệ sinh CIP", "7.Chiller": "7. Máy làm lạnh", "8.Compressor": "8. Máy nén khí", "9. Steam Boiler": "9. Nồi hơi",
    "10. Installation Material": "10. Vật tư lắp đặt", "Fresh\u00a0cow milk, powder milk": "Sữa bò tươi, sữa bột",
    "UHT whole milk, UHT skimmed milk, UHT   flavor milk, etc": "Sữa nguyên kem UHT, sữa gầy UHT, sữa hương vị UHT và các sản phẩm khác",
    "Brick shape aseptic carton, (like   Tetra\u00a0pack) ,\u00a0Pillow shape aseptic pouch, plastic bottle, etc": "Hộp giấy tiệt trùng dạng brick (như Tetra Pak), túi tiệt trùng dạng gối, chai nhựa và các loại khác",
    "With a product that can be stored for long periods without spoiling and  with no need for refrigeration, there are many advantages for both the  producer, the retailer and the consumer. This includes expensive  products such as milk, cream, desserts and sauces.": "Sản phẩm có thể bảo quản trong thời gian dài mà không bị hỏng và không cần làm lạnh, mang lại nhiều lợi ích cho nhà sản xuất, nhà bán lẻ và người tiêu dùng. Các sản phẩm này gồm sữa, kem, món tráng miệng và nước xốt.",
    "Various UHT milk processing systems:": "Các hệ thống xử lý sữa UHT phổ biến:", "There are two main types of UHT systems on the market.": "Trên thị trường hiện có hai loại hệ thống UHT chính.",
    "In a modern UHT milk production line (Ultra High Temperature) is pumped  through a closed system. On the way it is preheated, highly heat  treated, homogenized, ultra highly heat treated, cooled and packed  aseptically.": "Trong dây chuyền sản xuất sữa UHT hiện đại (nhiệt độ siêu cao), sản phẩm được bơm qua hệ thống kín. Trên đường đi, sản phẩm được gia nhiệt sơ bộ, xử lý nhiệt, đồng hóa, xử lý nhiệt độ siêu cao, làm nguội và đóng gói vô trùng.",
    "In a modern UHT milk production line (Ultra High Temperature) is pumped through a closed system. On the way it is preheated, highly heat treated, homogenized, ultra highly heat treated, cooled and packed aseptically. Low acid (pH above 4.5 – for milk more than pH 6.5) liquid products are usually treated at 135 – 150C for a few seconds holding, by either indirect heating or direct steam injection or infusion. High acid (pH below 4.5) products such as juice are normally heated at 90 – 95C for 15 – 30 seconds holding. All parts of the system downstream of the actual highly heating section are of aseptic design to eliminate the risk of reinfection, include aseptic packaging in packages protecting the product against light and atmospheric oxygen. Ambient storage is normal.": "Trong dây chuyền sản xuất sữa UHT hiện đại (nhiệt độ siêu cao), sản phẩm được bơm qua hệ thống kín, gia nhiệt sơ bộ, xử lý nhiệt, đồng hóa, xử lý nhiệt độ siêu cao, làm nguội và đóng gói vô trùng. Sản phẩm lỏng ít axit (pH trên 4,5, với sữa thường trên pH 6,5) được xử lý ở 135–150°C trong vài giây bằng gia nhiệt gián tiếp hoặc phun/truyền hơi trực tiếp. Sản phẩm axit cao như nước ép được gia nhiệt ở 90–95°C trong 15–30 giây. Phần hệ thống phía sau khu vực gia nhiệt được thiết kế vô trùng để ngăn tái nhiễm; bao bì vô trùng bảo vệ sản phẩm khỏi ánh sáng và oxy, cho phép bảo quản ở điều kiện thường.",
    "The whole pasteurized milk processing plant including:": "Nhà máy xử lý sữa thanh trùng hoàn chỉnh bao gồm:",
    "This milk production line produces several types of pasteurized milk products, i.e. whole milk, skimmed milk and standardized milk of various fat contents.": "Dây chuyền này sản xuất nhiều loại sữa thanh trùng như sữa nguyên chất, sữa gầy và sữa tiêu chuẩn với các hàm lượng chất béo khác nhau.",
    "The purpose of standardization is to give the milk a defined, guaranteed fat content.": "Mục đích của quá trình tiêu chuẩn hóa là tạo ra sữa có hàm lượng chất béo xác định và ổn định.",
    "This processing line mainly produces UHT milk which has a long shelf life in different types of packaging, such as aseptic cartons(like Tetra Brick, Tetra Prisma and SIG Combibloc), Aseptic pillow pouch(like Tetra Fino), Aseptic soft pouch, etc.": "Dây chuyền này chủ yếu sản xuất sữa UHT có thời hạn sử dụng dài với nhiều dạng bao bì khác nhau như hộp giấy vô trùng (Tetra Brick, Tetra Prisma và SIG Combibloc), túi vô trùng dạng gối (Tetra Fino), túi mềm vô trùng và các loại khác.",
    "Low acid (pH above 4.5 – for milk more than pH 6.5) liquid products are usually treated at 135 – 150C for a few seconds holding, by either indirect heating or direct steam injection or infusion.": "Các sản phẩm lỏng ít axit (pH trên 4,5, với sữa thường trên pH 6,5) thường được xử lý ở 135–150°C trong vài giây bằng gia nhiệt gián tiếp hoặc phun hơi trực tiếp hay truyền hơi.",
    "High acid (pH below 4.5) products such as juice are normally heated at 90 – 95C for 15 – 30 seconds holding.": "Các sản phẩm có tính axit cao (pH dưới 4,5) như nước ép thường được gia nhiệt ở 90–95°C và giữ nhiệt trong 15–30 giây.",
    "All parts of the system downstream of the actual highly heating section are of aseptic design to eliminate the risk of reinfection, include aseptic packaging in packages protecting the product against light and atmospheric oxygen. Ambient storage is normal.": "Toàn bộ phần hệ thống phía sau khu vực gia nhiệt chính được thiết kế vô trùng để loại bỏ nguy cơ tái nhiễm; bao bì vô trùng bảo vệ sản phẩm khỏi ánh sáng và oxy trong không khí. Sản phẩm có thể bảo quản ở điều kiện thường.",
    "- In the direct systems the product comes in direct contact with the heating medium, followed by flash cooling in a vacuum vessel and eventually further indirect cooling to packaging temperature. The direct systems are divided into:": "- Với hệ thống gia nhiệt trực tiếp, sản phẩm tiếp xúc trực tiếp với môi chất gia nhiệt, sau đó được làm nguội nhanh trong bình chân không và tiếp tục làm nguội gián tiếp đến nhiệt độ đóng gói. Hệ thống trực tiếp gồm:",
    "•steam injection systems (steam injected into product),": "• hệ thống phun hơi (hơi được phun trực tiếp vào sản phẩm),",
    "•steam infusion systems (product introduced into a steam-filled vessel).": "• hệ thống truyền hơi (sản phẩm được đưa vào bình chứa đầy hơi).",
    "- In the indirect systems the heat is transferred from the heating media to the product through a partition (plate or tubular wall). The indirect systems can be based on:": "- Với hệ thống gia nhiệt gián tiếp, nhiệt được truyền từ môi chất gia nhiệt sang sản phẩm qua vách ngăn (dạng tấm hoặc ống). Hệ thống gián tiếp có thể sử dụng:",
    "•plate heat exchangers,": "• bộ trao đổi nhiệt dạng tấm,",
    "•tubular heat exchangers,": "• bộ trao đổi nhiệt dạng ống,",
    "•scraped surface heat exchangers,": "• bộ trao đổi nhiệt bề mặt cạo,",
    "Furthermore it is possible to combine the heat exchangers in the direct systems according to product and process requirements": "Ngoài ra, có thể kết hợp các bộ trao đổi nhiệt trong hệ thống trực tiếp tùy theo yêu cầu của sản phẩm và quy trình.",
    "First the milk is preheated and standardized by in line milk fat standardization system.": "Trước tiên, sữa được gia nhiệt sơ bộ và tiêu chuẩn hóa bằng hệ thống tiêu chuẩn hóa hàm lượng chất béo trên dây chuyền.",
    "Common values are 1.5% for low fat milk and 3% for regular grade milk, fat contents as low as 0.1 and 0.5 % is skimmed milk.": "Hàm lượng chất béo thường là 1,5% đối với sữa ít béo và 3% đối với sữa tiêu chuẩn; mức 0,1–0,5% được xem là sữa gầy.",
    "Then the standardized milk is homogenized. The purpose of homogenization is to disintegrate or finely distribute the fat globules in the milk in order to reduce creaming. Homogenization may be total or partial. Partial homogenization is a more economical solution, because a smaller homogenizer can be used.": "Sữa sau tiêu chuẩn hóa được đồng hóa. Mục đích của đồng hóa là phá nhỏ hoặc phân tán đều các cầu chất béo trong sữa để hạn chế hiện tượng tách kem. Có thể đồng hóa toàn phần hoặc một phần; đồng hóa một phần tiết kiệm hơn vì chỉ cần máy đồng hóa nhỏ hơn.",
    "The milk now is pumped to the heating section of the milk heat exchanger where it is pasteurized.": "Sữa được bơm đến khu vực gia nhiệt của bộ trao đổi nhiệt sữa để thanh trùng.",
    "The necessary holding time is provided by a separate holding tube.": "Thời gian giữ nhiệt cần thiết được đảm bảo bởi ống giữ nhiệt riêng.",
    "The pasteurization temperature is recorded continuously.": "Nhiệt độ thanh trùng được ghi nhận liên tục.",
    "Temperature and pasteurization holding time are very important factors which must be specified precisely in relation to the quality of the milk and its shelf life requirements.": "Nhiệt độ và thời gian giữ nhiệt thanh trùng là các yếu tố rất quan trọng, cần được xác định chính xác theo chất lượng sữa và yêu cầu về thời hạn sử dụng.",
    "The pasteurization temperature is usually 72 – 75C for 15 – 20 sec.": "Nhiệt độ thanh trùng thường là 72–75°C trong 15–20 giây.",
    "A common requirement is that the heat treatment must guarantee the destruction of unwanted microorganisms and of all pathogenic bacteria without the product being damaged.": "Yêu cầu chung là quá trình xử lý nhiệt phải tiêu diệt các vi sinh vật không mong muốn và toàn bộ vi khuẩn gây bệnh mà không làm hư hại sản phẩm.",
    "This milk production line produces several types of pasteurized milk products, i.e. whole milk, skimmed milk and standardized milk of various fat contents.": "Dây chuyền sản xuất sữa này tạo ra nhiều loại sữa thanh trùng gồm sữa nguyên chất, sữa gầy và sữa tiêu chuẩn với các hàm lượng chất béo khác nhau.",
    "This processing line produces several types of pasteurized milk products, i.e. whole milk, skimmed milk and standardized milk of various fat contents.": "Dây chuyền này sản xuất nhiều loại sữa thanh trùng gồm sữa nguyên chất, sữa gầy và sữa tiêu chuẩn với các hàm lượng chất béo khác nhau.",
    "UHT milk plant": "Nhà máy sữa UHT", "technical parameters:": "thông số kỹ thuật:",
    "Whole UHT milk processing plant including:": "Nhà máy xử lý sữa UHT hoàn chỉnh bao gồm:",
    "Pasteurized whole milk, pasteurized skimmed milk, pasteurized flavor milk, etc": "Sữa nguyên kem thanh trùng, sữa gầy thanh trùng, sữa hương vị thanh trùng và các sản phẩm khác",
    "Gable Top carton, plastic pouch, plastic bottle, etc": "Hộp giấy Gable Top, túi nhựa, chai nhựa và các loại khác",
    "share to:": "Chia sẻ:", "Google Tag Manager End Google Tag Manager": "Google Tag Manager",
    "This milk production line": "Dây chuyền sản xuất sữa này",
    "Joylong offers total solution of beverage production for our customers.": "Joylong cung cấp giải pháp tổng thể về sản xuất đồ uống cho khách hàng.",
    "Based on experiences in beverage industry, we make a comprehensive, systematic design and planning for customers by following international food regulation and advanced technology.": "Dựa trên kinh nghiệm trong ngành đồ uống, chúng tôi thiết kế và lập kế hoạch toàn diện, có hệ thống theo các quy định quốc tế về thực phẩm và công nghệ tiên tiến.",
    "Joylong can provide variable beverage products production combination": "Joylong có thể cung cấp các tổ hợp sản xuất đồ uống linh hoạt",
    "We appreciate your interest in JOYLONG and want to provide you the best service possible.": "Chúng tôi trân trọng sự quan tâm của quý khách dành cho JOYLONG và mong muốn cung cấp dịch vụ tốt nhất.",
    "Your enquire will be responded within 24 hours by the support of JOYLONG's international sales team.": "Đội ngũ kinh doanh quốc tế của JOYLONG sẽ phản hồi yêu cầu của quý khách trong vòng 24 giờ.",
    "Please feel free to contact us by any of the methods below.": "Vui lòng liên hệ với chúng tôi bằng bất kỳ phương thức nào dưới đây.",
    "JOYLONG's technical support team is work through professional consultation, exquisite technical support and rigorous work attitude, to provide you with the comprehensive feasible high quality and standard solution in order to constantly meet your needs, and finally achieve satisfactory results.": "Đội ngũ hỗ trợ kỹ thuật của JOYLONG cung cấp tư vấn chuyên nghiệp, hỗ trợ kỹ thuật tận tâm và làm việc nghiêm túc để mang đến giải pháp toàn diện, khả thi, chất lượng cao và tiêu chuẩn, đáp ứng nhu cầu của quý khách.",
    "As a good adviser and assistant of clients, we can enable them to get rich and generous returns on their investments:": "Với vai trò cố vấn và trợ lý đáng tin cậy, chúng tôi giúp khách hàng đạt được hiệu quả đầu tư cao:",
    "In the process of the clients buying the products, we will through a series of rigorous service style to provide clients the satisfactory and considerate service.": "Trong quá trình khách hàng mua sản phẩm, chúng tôi cung cấp dịch vụ chu đáo và tận tâm thông qua quy trình phục vụ nghiêm ngặt.",
    "If you are an export client, we will support you the thoughtful documentary service from the date of signing the contract until the equipment installation and modulation finished.": "Đối với khách hàng xuất khẩu, chúng tôi hỗ trợ đầy đủ hồ sơ từ ngày ký hợp đồng đến khi hoàn tất lắp đặt và chạy thử thiết bị.",
    "We respect clients and always devote ourselves to improving the total value of clients.": "Chúng tôi tôn trọng khách hàng và luôn nỗ lực nâng cao giá trị tổng thể mà khách hàng nhận được.",
    "We will contact our customers at the first time, get the detailed customer requirements, material component, pre-order the operation site, etc, help our customers analyze problems and solve them.": "Chúng tôi chủ động liên hệ, thu thập yêu cầu chi tiết và thông tin nguyên liệu, khảo sát trước địa điểm vận hành, đồng thời hỗ trợ khách hàng phân tích và giải quyết vấn đề.",
    "After your acceptance on our milk and beverage production equipment, we will offer one-year free maintenance service.": "Sau khi khách hàng nghiệm thu thiết bị sản xuất sữa và đồ uống, chúng tôi cung cấp một năm bảo trì miễn phí.",
    "During this period of time, we will handle machine failures and damages, excluding malfunction caused by misuse.": "Trong thời gian này, chúng tôi xử lý các lỗi và hư hỏng của máy, ngoại trừ sự cố do sử dụng sai cách.",
    "If warranty time is out, charged service is also available covering spare parts supply and maintenance services.": "Sau khi hết thời hạn bảo hành, dịch vụ có tính phí gồm cung cấp phụ tùng và bảo trì vẫn luôn sẵn sàng.",
    "To any problems, we promise to response within 48 hours and offer troubleshooting with 72 hours.": "Với mọi vấn đề, chúng tôi cam kết phản hồi trong 48 giờ và đưa ra hướng xử lý trong vòng 72 giờ.",
    "We will attend to your inquiry as soon as possible.": "Chúng tôi sẽ phản hồi yêu cầu của quý khách trong thời gian sớm nhất.",
    "The small scale milk, yoghurt, juice combined production line": "Dây chuyền kết hợp sữa, sữa chua và nước ép quy mô nhỏ",
    "The Small Scale Milk, Yoghurt, Juice Combined Production Line": "Dây chuyền kết hợp sữa, sữa chua và nước ép quy mô nhỏ",
    "The growing sense of superiority and an endless supply of quality industrial machinery manufacturing changing world.": "Tinh thần cầu tiến cùng nguồn cung dồi dào các thiết bị công nghiệp chất lượng giúp chúng tôi đồng hành với thế giới không ngừng thay đổi.",
    "No matter how the world changes, joylong the spirit of excellence that will never change.": "Dù thế giới thay đổi thế nào, tinh thần theo đuổi sự xuất sắc của Joylong vẫn luôn vững bền.",
    "Apricot Plum Peach Beverage Processing Line": "Dây chuyền sản xuất đồ uống mơ, mận và đào",
    "Passion fruit Guava Beverage Processing Line": "Dây chuyền sản xuất đồ uống chanh dây và ổi",
    "Blueberry Raspberry Strawberry Beverage Processing Line": "Dây chuyền sản xuất đồ uống việt quất, mâm xôi và dâu tây",
    "Apricot plum peach Beverage Processing Line": "Dây chuyền sản xuất đồ uống mơ, mận và đào",
    "Coconut Water Milk Processing Line": "Dây chuyền xử lý nước dừa và sữa",
    "Apple Pear Processing Line": "Dây chuyền chế biến táo và lê",
    "Citrus Processing Line": "Dây chuyền chế biến cam quýt", "Tomato Processing Line": "Dây chuyền chế biến cà chua",
    "Complete milk processing line,Complete yogurt processing line,Complete juice processing line,Complete water production line": "Dây chuyền sản xuất sữa hoàn chỉnh, dây chuyền sản xuất sữa chua hoàn chỉnh, dây chuyền sản xuất nước ép hoàn chỉnh, dây chuyền xử lý nước hoàn chỉnh",
    "This processing line mainly produces UHT milk which has a long shelf life in different types of packaging, such as aseptic cartons(like Tetra Brick, Tetra Prisma and SIG Combibloc), Aseptic pillow pouch(like Tetra Fino), Aseptic soft pouch, etc.": "Dây chuyền này chủ yếu sản xuất sữa UHT có thời hạn sử dụng dài với nhiều dạng bao bì như hộp giấy vô trùng (Tetra Brick, Tetra Prisma và SIG Combibloc), túi vô trùng dạng gối (Tetra Fino), túi mềm vô trùng và các loại khác.",
    "Pump is a booster pump which increases the pressure of the product to a level at which the pasteurized product cannot be contaminated by untreated milk or by the cooling medium if a leak occur in the plate heat exchanger. If the pasteurization temperature should drop, this is sensed by a temperature transmitter. A signal activates flow diversion valve and the milk flows back to the balance tank. After pasteurization the milk continues to a cooling section in the heat exchanger, where it is regeneratively cooled by the incoming untreated cold milk, and then to the cooling section where it is cooled with ice water. The cold milk is then pumped to the filling machines.": "Bơm tăng áp nâng áp suất sản phẩm đến mức giúp sữa thanh trùng không bị nhiễm bởi sữa chưa xử lý hoặc môi chất làm lạnh khi bộ trao đổi nhiệt dạng tấm rò rỉ. Nếu nhiệt độ thanh trùng giảm, bộ truyền nhiệt sẽ phát hiện và kích hoạt van chuyển dòng để sữa quay lại bồn cân bằng. Sau thanh trùng, sữa được làm nguội hồi nhiệt bằng dòng sữa lạnh chưa xử lý đi vào, tiếp tục làm nguội bằng nước đá rồi được bơm đến máy chiết rót.",
    "Shanghai Joylong Industry Co., Ltd is the leading manufacturer and exporter of high quality aseptic brick carton filling machines and various kinds of dairy ,beverage processing machinery in China.Our major engineering projects include complete dairy products production line,beverage production line,drinking water production line,etc.We have a highly efficient team to deal with inquiries from customers. We are experienced in exporting our machines to America, Europe, Oceania, Asia, Africa, etc., over 40 countries and regions, and enjoy a good reputation among clients.As the top-leading corporation for aseptic brick carton filling machines,and dairy,beverage processing machinery in China, Joylong offers our customers not only the advanced machines with competitive and economical efficiency, but also the total solution of turn-key projects.We provide the design, production, and assembly of small and medium and large dairy and beverage processing lines in accordance with the customer's specific demands.We are never satisfied with the present achievements. The client's need is our motive force to design and build the top quality product in China.For the detailed information, you can contact our sales office/agent in the worldwide. Our technical specialists are at your service for 24 hours. We are happy to cooperate with you.": "Shanghai Joylong Industry Co., Ltd là nhà sản xuất và xuất khẩu hàng đầu tại Trung Quốc về máy chiết rót hộp giấy vô trùng cùng các thiết bị chế biến sữa và đồ uống chất lượng cao. Các dự án kỹ thuật chủ lực gồm dây chuyền sản xuất sữa, đồ uống và nước uống hoàn chỉnh. Chúng tôi đã xuất khẩu thiết bị tới hơn 40 quốc gia và khu vực, đồng thời cung cấp máy móc tiên tiến cùng giải pháp trọn gói chìa khóa trao tay. Joylong thiết kế, sản xuất và lắp ráp dây chuyền quy mô nhỏ, vừa và lớn theo nhu cầu riêng của khách hàng. Nhu cầu của khách hàng là động lực để chúng tôi không ngừng nâng cao chất lượng. Vui lòng liên hệ văn phòng hoặc đại lý bán hàng trên toàn thế giới; các chuyên gia kỹ thuật luôn sẵn sàng hỗ trợ 24/7.",
    "Advanced production equipment, production lines are augmented by a full class quality, technical experts directly involved in the production. The stable and reliable products to ensure that nothing goes wrong.": "Thiết bị sản xuất hiện đại và dây chuyền đồng bộ được kiểm soát theo tiêu chuẩn chất lượng cao, với các chuyên gia kỹ thuật trực tiếp tham gia sản xuất. Sản phẩm ổn định, đáng tin cậy và bảo đảm vận hành an toàn.",
    "JOYLONG through the own established system that have efficient mechanism, worldwide service and excellent supply network, ensure the spare parts and materials' demand and consumption of the clients in production activities.": "Thông qua hệ thống do JOYLONG xây dựng với cơ chế hiệu quả, dịch vụ toàn cầu và mạng lưới cung ứng rộng khắp, chúng tôi bảo đảm nhu cầu phụ tùng và vật tư cho hoạt động sản xuất của khách hàng.",
    "JOYLONG wear-resistant parts are well known for good toughness, super wear resistant and longer service-life. We can offer high-strength spare parts, such as wire and cable, electrical control, pipe valves, the trough of the door frame, transmission device, operating platform, refrigeration systems, compressed air systems and steam system and etc.": "Phụ tùng chống mài mòn của JOYLONG nổi tiếng nhờ độ bền, khả năng chịu mài mòn cao và tuổi thọ dài. Chúng tôi cung cấp phụ tùng cường độ cao như dây điện, cáp, tủ điều khiển, van đường ống, bộ truyền động, sàn thao tác, hệ thống lạnh, khí nén và hơi nước.",
    "JOYLONG has been striding in decisive efforts to optimize your beverage processing solutions by offering complete dairy and drinks production lines as well as stand-alone equipment. Our food machinery has been designed and tested to the highest levels of quality and sanitation, thus offering the best performance.": "JOYLONG không ngừng tối ưu giải pháp chế biến đồ uống bằng cách cung cấp dây chuyền sữa và đồ uống hoàn chỉnh cùng thiết bị độc lập. Máy móc thực phẩm được thiết kế và kiểm thử theo tiêu chuẩn cao nhất về chất lượng và vệ sinh, mang lại hiệu suất vượt trội.",
    "1. You will have the shortest commissioning time before our milk and beverage production line is ready to rock.": "1. Thời gian chạy thử được rút ngắn tối đa trước khi dây chuyền sữa và đồ uống sẵn sàng vận hành.",
    "2. You will receive systematic training for smooth machine operation. Our fully automatic milk and beverage processing line as well as filling line also deliver outstanding efficiency.": "2. Quý khách được đào tạo bài bản để vận hành máy thuận lợi. Dây chuyền sữa, đồ uống và dây chuyền chiết rót hoàn toàn tự động mang lại hiệu quả nổi bật.",
    "3. You will enjoy in-time repair service and scheduled maintenance.": "3. Quý khách được hưởng dịch vụ sửa chữa kịp thời và bảo trì theo lịch.",
    "Compare with single equipment, we pursue comprehensive efficiency and ability of complete line for the beverage factory and focus on factory design and combination of beverage production.": "So với thiết bị đơn lẻ, chúng tôi hướng đến hiệu quả tổng thể và năng lực của dây chuyền hoàn chỉnh, tập trung vào thiết kế nhà máy và tổ hợp sản xuất đồ uống.",
    "By combining advanced management through costs, beverage production line technology (pretreatment, treatment, filling and packaging), logistics and informatization technology, we finish complete plant design and running for customers.": "Bằng cách kết hợp quản lý chi phí tiên tiến, công nghệ dây chuyền đồ uống (tiền xử lý, xử lý, chiết rót và đóng gói), logistics và công nghệ thông tin, chúng tôi hoàn thiện thiết kế và vận hành nhà máy cho khách hàng.",
    "it covers water treatment, beverage treatment, filling, labeling, conveying and packaging. By individualized selection treatment for device, it can satisfy customers’ requirement for variety or individuation.": "giải pháp bao gồm xử lý nước, xử lý đồ uống, chiết rót, dán nhãn, vận chuyển và đóng gói. Việc lựa chọn thiết bị theo từng nhu cầu giúp đáp ứng yêu cầu đa dạng hoặc riêng biệt của khách hàng.",
    "In order to get running situation for the products in the plant and client device, Joylong established an advanced service feedback system and effective dispose, which largely increase the service quality and decrease the running cost.": "Để nắm bắt tình trạng vận hành của sản phẩm và thiết bị tại nhà máy, Joylong xây dựng hệ thống phản hồi dịch vụ tiên tiến và cơ chế xử lý hiệu quả, qua đó nâng cao chất lượng dịch vụ và giảm chi phí vận hành.",
}

# Preserve translations already present in the reviewed VI mirror. The
# structured entries above take precedence; this memory fills page-specific
# headings, captions and product copy without touching markup or URLs.
_memory_path = Path(__file__).with_name("vi_memory.json")
try:
    _MEMORY = json.loads(_memory_path.read_text(encoding="utf8")) if _memory_path.exists() else {}
except (OSError, ValueError, TypeError):
    _MEMORY = {}

def translate_text(value):
    original = value
    # Mirrored HTML uses non-breaking spaces and line-wrapped whitespace in
    # long paragraphs. Normalize visible text before applying phrase entries
    # so the same locale data works across every generated page.
    value = re.sub(r"\s+", " ", value).strip() if value.strip() else value
    if value in _MEMORY:
        return _MEMORY[value]
    # Long phrases first; this prevents fragments such as "Product" from
    # corrupting a translated sentence.
    for src in sorted(TRANSLATIONS, key=len, reverse=True):
        value = value.replace(re.sub(r"\s+", " ", src).strip(), TRANSLATIONS[src])
    value = re.sub(r"\bComplete\s+(?=[A-ZÀ-Ỹ])", "", value)
    return value if value != original else original

def locale_href(href, vi_root: Path):
    if not href or not href.startswith("/") or href.startswith("//") or href.startswith(ASSET_PREFIXES):
        return href
    if href.startswith(VI_PREFIX):
        return href
    path, sep, suffix = href.partition("?")
    path, hash_sep, fragment = path.partition("#")
    candidate = path.lstrip("/")
    if candidate.endswith(".html") and (vi_root / candidate).exists():
        return VI_PREFIX + candidate + (("?" + suffix) if sep else "") + (("#" + fragment) if hash_sep else "")
    return href

def translate_document(path: Path, vi_root: Path):
    soup = BeautifulSoup(path.read_text(encoding="utf8"), "html.parser")
    for node in list(soup.find_all(string=True)):
        if not isinstance(node, NavigableString) or isinstance(node, (Comment, Doctype)) or node.parent.name in {"script", "style", "noscript"}:
            continue
        node.replace_with(translate_text(str(node)))
    for tag in soup.find_all(True):
        for attr in ("placeholder", "aria-label", "title", "alt"):
            if tag.has_attr(attr): tag[attr] = translate_text(tag[attr])
        if tag.name == "a" and tag.has_attr("data-lang"):
            # Language menu entries are routing metadata. They must never be
            # passed through the VI content resolver.
            continue
        if tag.name in {"a", "form"}:
            key = "href" if tag.name == "a" else "action"
            if tag.has_attr(key): tag[key] = locale_href(tag[key], vi_root)
    # Localize SEO titles from the rendered heading while preserving the
    # company name and model identifiers used by the source pages.
    if soup.title:
        title_text = " ".join(soup.title.get_text(" ", strip=True).split())
        heading = soup.find("h1")
        if heading and ("Supplier" in title_text or "Factory" in title_text or "processing line" in title_text.lower()):
            soup.title.string = f"{translate_text(heading.get_text(' ', strip=True))} - Shanghai Joylong Industry Co.,Ltd"
        else:
            soup.title.string = translate_text(title_text)
    path.write_text(str(soup), encoding="utf8")
