create or replace function pos_private.submit_order(p_request uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.orders;actor_email text;order_state text;payment_method text;order_total numeric;paid_amount numeric;
begin
 if auth.uid() is null or not public.is_staff() or public.is_admin() then raise exception 'CASHIER_REQUIRED' using errcode='42501';end if;
 if p_request is null or jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'INVALID_ORDER';end if;
 actor_email:=lower(auth.jwt()->>'email');
 perform pg_advisory_xact_lock(hashtextextended('pos.submit.'||p_request::text,0));
 select * into o from public.orders where id=p_request;
 if found then
  if o.created_by_email is distinct from actor_email then raise exception 'ORDER_REQUEST_NOT_OWNED' using errcode='42501';end if;
  if o.items is distinct from p_payload->'items' or o.total is distinct from (p_payload->>'total')::numeric or o.order_type is distinct from coalesce(p_payload->>'order_type','dine') or o.customer is distinct from nullif(p_payload->'customer','null'::jsonb) then raise exception 'ORDER_REQUEST_MISMATCH';end if;
  return jsonb_build_object('saved',true,'id',o.id,'number',coalesce(o.day_number,o.number),'state',o.state,'existing',true);
 end if;
 order_state:=coalesce(p_payload->>'state','completed');payment_method:=coalesce(p_payload->>'method','cash');order_total:=(p_payload->>'total')::numeric;paid_amount:=(p_payload->>'paid')::numeric;
 if order_state not in ('active','completed') or payment_method not in ('cash','card') or jsonb_typeof(p_payload->'items') is distinct from 'array' or jsonb_array_length(p_payload->'items')=0 or order_total is null or order_total::text in ('NaN','Infinity','-Infinity') or order_total<0 then raise exception 'INVALID_ORDER';end if;
 if paid_amount is not null and (paid_amount::text in ('NaN','Infinity','-Infinity') or paid_amount<0 or (order_state='completed' and payment_method='cash' and paid_amount<order_total)) then raise exception 'INVALID_PAID_AMOUNT';end if;
 insert into public.orders(id,items,total,method,paid,order_type,customer,state)
 values(p_request,p_payload->'items',order_total,payment_method,case when order_state='completed' and payment_method='cash' then paid_amount else null end,coalesce(p_payload->>'order_type','dine'),nullif(p_payload->'customer','null'::jsonb),order_state) returning * into o;
 return jsonb_build_object('saved',true,'id',o.id,'number',coalesce(o.day_number,o.number),'state',o.state,'existing',false);
end $$;
create or replace function public.submit_pos_order(p_request uuid,p_payload jsonb) returns jsonb language sql security invoker set search_path='' as $$select pos_private.submit_order(p_request,p_payload)$$;
revoke all on function pos_private.submit_order(uuid,jsonb),public.submit_pos_order(uuid,jsonb) from public,anon,authenticated;
grant execute on function pos_private.submit_order(uuid,jsonb),public.submit_pos_order(uuid,jsonb) to authenticated;
