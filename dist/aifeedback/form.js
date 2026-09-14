$(function(){
	// Submission is handled by local-runtime.js and persisted through our own API.
	// Keep a same-origin POST fallback if the runtime handler cannot load.
	$('.crm-form form').attr({action:'/api/inquiries',method:'post'});
	$('input[name="pagetitle"]').val(document.title);
	var crmValidStr = "Trường này là bắt buộc.";
	var crmEmailStr = "Vui lòng nhập địa chỉ email hợp lệ.";
		$(".crm-form").find("input[name='Name'],input[name='Email'],textarea[name='Message']").bind("keyup blur",function(){
    	_crminputVali($(this),crmValidStr);
	});
    });
    function _crminputVali(item,text){
        item.parent().find(".crmFormVali-error").remove();
        var value = $.trim(item.val());
        var re = /^[a-zA-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
        if(item.attr("name")=="Email"){
            if(!re.test( value )){item.after('<div style="color:#a94442;font-size:12px;line-height:1;margin-top:2px;" class="crmFormVali-error">'+text+'</div>'); }
            return re.test( value );
        }else if(!value){
            item.after('<div style="color:#a94442;font-size:12px;line-height:1;margin-top:2px;" class="crmFormVali-error">'+text+'</div>'); return false;
        }else{
            return true;
        }
    }
    function _crmAlertText(type,text){
        $("body").addClass("crm-body-clear");
        var succ = '<div id="crmMailMask"><div class="crmMailMask-box"><div class="crmMailMask-boxTop">'+text+'</div><div class="crmMailMask-boxBot"><button type="button" class="crmMailMask-close"> Đóng </button></div></div></div>';
        if(type==1){
            $("body").find("#crmMailMask").remove();
            $("body").append(succ);
        }
        $(".crmMailMask-close").click(function(){
            $("#crmMailMask").remove();
            $("body").removeClass("crm-body-clear");
        });
     }
