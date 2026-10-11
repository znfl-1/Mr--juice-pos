create or replace function pos_private.account_order() returns trigger language plpgsql security definer set search_path='' as $$
declare actor uuid;t public.till_sessions;enforced boolean; event text; amount numeric;
begin
 if tg_op='UPDATE' and old.till_session_id is not null then
  if new.total is distinct from old.total or new.method is distinct from old.method or new.items is distinct from old.items or new.till_session_id is distinct from old.till_session_id then raise exception 'PAID_ORDER_IMMUTABLE';end if;
  if old.state='completed' and new.state not in ('completed','refunded') then raise exception 'REFUND_REQUIRED';end if;
  if old.state='refunded' and new.state<>'refunded' then raise exception 'REFUND_IMMUTABLE';end if;
 end if;
 if (tg_op='INSERT' and new.state='completed') or (tg_op='UPDATE' and old.state='active' and new.state='completed') then
  event:='sale_'||new.method;amount:=new.total;
 elsif tg_op='UPDATE' and old.state='completed' and new.state='refunded' then
  event:='refund_'||old.method;amount:=-old.total;
 else
  if tg_op='INSERT' then new.till_session_id:=null;end if;
  return new;
 end if;
 select enforce_tills into enforced from public.till_settings where id;
 if auth.uid() is null or not public.is_staff() then
  if enforced then raise exception 'STAFF_REQUIRED' using errcode='42501';end if;
  return new;
 end if;
 actor:=auth.uid();
 if event like 'refund_%' and public.is_admin() then
  select * into t from public.till_sessions where id=nullif(current_setting('pos.refund_till',true),'')::uuid and state='open' for update;
 else
  select * into t from public.till_sessions where cashier_id=actor and state='open' for update;
 end if;
 if not found then
  if enforced then raise exception 'OPEN_TILL_REQUIRED';end if;
  if tg_op='INSERT' then new.till_session_id:=null;end if;
  return new;
 end if;
 if event like 'sale_%' then new.till_session_id:=t.id;end if;
 insert into public.till_entries(session_id,kind,amount,order_id,title,created_by)
 values(t.id,event,amount,new.id,'طلب #'||new.number,actor);
 return new;
end $$;

create or replace function pos_private.refund_order(p_order_id uuid,p_reason text,p_session_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.orders;begin
 if auth.uid() is null or not public.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501';end if;
 select * into o from public.orders where id=p_order_id for update;
 if not found or o.state<>'completed' then raise exception 'ORDER_NOT_COMPLETED';end if;
 perform 1 from public.till_sessions where id=p_session_id and state='open' for update;
 if not found then raise exception 'OPEN_TILL_REQUIRED';end if;
 perform set_config('pos.refund_till',p_session_id::text,true);
 update public.orders set state='refunded',refund_reason=nullif(trim(p_reason),'') where id=p_order_id;
 perform set_config('pos.refund_till','',true);
 return jsonb_build_object('refunded',true,'id',p_order_id);
end $$;
create or replace function public.admin_refund_order(p_order_id uuid,p_reason text,p_session_id uuid) returns jsonb language sql security invoker set search_path='' as $$select pos_private.refund_order(p_order_id,p_reason,p_session_id)$$;
revoke all on function pos_private.refund_order(uuid,text,uuid),public.admin_refund_order(uuid,text,uuid) from public,anon,authenticated;
grant execute on function pos_private.refund_order(uuid,text,uuid),public.admin_refund_order(uuid,text,uuid) to authenticated;
alter policy "cashier read today orders" on public.orders using (
 public.is_staff() and state<>'cancelled' and (state='active' or business_day_id in (select id from public.pos_business_days where state='open') or (business_day_id is null and created_at >= (date_trunc('day',now() at time zone 'Africa/Cairo') at time zone 'Africa/Cairo')))
);
