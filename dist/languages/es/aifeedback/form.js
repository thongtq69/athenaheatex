$(function(){
	$.get('/aifeedback/save.php?act=checksend',{},function(data){});
	var pagetitle='';
	$('#pagetitle').val(document.title);
        var crmValidStr = "Este campo está requerido.";
        var crmEmailStr = "Please enter a valid email address.";
        var crmFailedStr = "Email send failed";
        $(".crm-form").find("input[name='Name'],input[name='Email'],textarea[name='Message']").bind("keyup blur",function(){
            _crminputVali($(this),crmValidStr);
        });
        $(".crm-form form").submit(function(){
            var result = 0;
            var form = $(this);
            form.find("input[name='Name'],input[name='Email'],textarea[name='Message']").each(function(){
                if(!_crminputVali($(this),crmValidStr)){result = 1;}
            });
            if(result) return false;
            form.find(".create-form-submit").attr("disabled","disabled").append('<span class="crm-submit-load"></span>');
            var url = "/aifeedback/save.php";
            $.post(url, form.serialize(), function(result){
                form.find(".create-form-submit").removeAttr("disabled").find(".crm-submit-load").remove();
                if(result=='1'){
                    _crmAlertText(1,'Correo electrónico enviado con éxito!');
                    form[0].reset();
                }
                else if(result=='2'){
                	_crmAlertText(1,'Content not allowed!');
                }
	        else if(result=='3'){
                	_crmAlertText(1,'Only one message allowed within 1 minute!');
                }
                else{ 
                    _crmAlertText(1,crmFailedStr);
                      
                }
            });
            return false;
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
        var succ = '<div id="crmMailMask"><div class="crmMailMask-box"><div class="crmMailMask-boxTop">'+text+'</div><div class="crmMailMask-boxBot"><button type="button" class="crmMailMask-close"> OK </button></div></div></div>';
        if(type==1){
            $("body").find("#crmMailMask").remove();
            $("body").append(succ);
        }
        $(".crmMailMask-close").click(function(){
            $("#crmMailMask").remove();
            $("body").removeClass("crm-body-clear");
        });
     }