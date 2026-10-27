"use client";
import { useWhatsAppApi } from "./account-context";
import { useApp } from "@/components/providers";
import { Avatar, Badge, Empty, ErrorBox, Loading, Modal } from "@/components/ui";
import { LeadForm } from "@/features/leads/lead-form";
import { Classifications } from "@/features/leads/classifications";
import { useWhatsAppResource as useResource } from "./account-context";
import { chatViews, type ChatView } from "@/lib/chat-groups";
import type { Chat, Lead, PageResult, SharedContact } from "@/lib/types";
import { Archive, ArchiveRestore, Link2, Plus, Search } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useContext, useEffect, useState } from "react";
import { WhatsAppAccountContext } from "./account-context";
import { WhatsAppWorkspace } from "./account-workspace";
import { BackupNumberContext, BackupWorkspace } from "./backup-workspace";
import { Connection } from "./connection";
import { Conversation } from "./conversation";
import { ChatList } from "./chat-list";
import { ContactButton, ContactForm } from "./contact-form";

export function ChatPage({ backup = false }: { backup?: boolean }) {
  return backup ? <BackupWorkspace><ChatContent backup /></BackupWorkspace>
    : <WhatsAppWorkspace><ChatContent backup={false} /></WhatsAppWorkspace>;
}

function ChatContent({ backup }: { backup: boolean }) {
  const { post, put, path } = useWhatsAppApi();
  const { user, notify } = useApp();
  const params = useSearchParams();
  const { accountId, userId: historyUser } = useContext(WhatsAppAccountContext);
  const backupNumber = useContext(BackupNumberContext);
  const [chat, setChat] = useState<Chat>();
  const [profilePhoto, setProfilePhoto] = useState<{ name: string; src: string }>();
  const [photoFailed, setPhotoFailed] = useState(false);
  const [search, setSearch] = useState("");
  const [views, setViews] = useState<ChatView[]>(["whatsapp"]);
  const [create, setCreate] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead>();
  const [contactChatId, setContactChatId] = useState<string>();
  const [error, setError] = useState("");
  const [archiving, setArchiving] = useState(false);
  const [phoneVariant, setPhoneVariant] = useState<{ original: string; phone: string; chat: Chat }>();
  const suffix = backup && historyUser ? `?userId=${historyUser}` : "";
  const pictureUrl = (chatId: string) =>
    `/api${path(`/whatsapp/profile-picture?chatId=${encodeURIComponent(chatId)}${
      backup && historyUser ? `&userId=${historyUser}` : ""
    }`)}`;
  function openProfilePhoto(contact: Chat) {
    setPhotoFailed(false);
    setProfilePhoto({
      name: contact.name.split("@")[0],
      src: pictureUrl(contact.id),
    });
  }
  const chats = useResource<Chat[]>(backup
    ? `/whatsapp/backup/chats?number=${encodeURIComponent(backupNumber)}${historyUser ? `&userId=${historyUser}` : ""}`
    : `/whatsapp/chats${suffix}`, 5000);
  const leadMatch = useResource<PageResult<Lead>>(
    chat && !backup && chat.id.endsWith("@s.whatsapp.net")
      ? `/leads?mine=true&search=${chat.id.split("@")[0]}`
      : null,
  );
  const matchedLead = leadMatch.data?.items.find(
    (l) => l.phone === chat?.id.split("@")[0],
  );
  const linkedLead =
    matchedLead &&
    matchedLead.chatId === chat?.id &&
    matchedLead.chatUserId === user?.id
      ? matchedLead
      : undefined;
  const selectedChat = chats.data?.find((item) => item.id === chat?.id);
  const selectedLeadStatus = selectedChat ? selectedChat.leadStatus : linkedLead?.status;
  const classificationLeadId = selectedChat?.leadId ?? linkedLead?.id;
  useEffect(() => {
    const phone = params.get("phone");
    if (!backup && (params.get("accountId") || "default") === accountId && phone && /^\d{10,15}$/.test(phone))
      setChat({
        id: phone + "@s.whatsapp.net",
        name: phone,
        lastText: "",
        updatedAt: Date.now(),
        archived: false,
        pinnedAt: 0,
      });
  }, [params, accountId, backup]);
  async function startConversation(contact: SharedContact) {
    setError("");
    try {
      const resolved = await post<{ phone: string; chatId: string; requiresConfirmation: boolean } | null>(
        "/whatsapp/resolve-phone",
        { phone: contact.phone.replace(/\D/g, "") },
      );
      if (!resolved) {
        setError("Este número e suas variações não foram encontrados no WhatsApp.");
        return;
      }
      const targetChat = chats.data?.find((item) => item.id === resolved.chatId) || {
        id: resolved.chatId,
        name: contact.name.replace(/\D/g, "") === contact.phone ? "+" + resolved.phone : contact.name,
        lastText: "",
        updatedAt: Date.now(),
        archived: false,
        pinnedAt: 0,
      };
      if (resolved.requiresConfirmation) {
        setPhoneVariant({ original: contact.phone, phone: resolved.phone, chat: targetChat });
        return;
      }
      setChat(targetChat);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function link() {
    if (!matchedLead || !chat) return;
    try {
      await post(`/leads/${matchedLead.id}/link`, { chatId: chat.id });
      leadMatch.reload();
      chats.reload();
      notify("Conversa vinculada ao lead.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function toggleArchived() {
    if (!selectedChat || archiving || chats.loading) return;
    setArchiving(true);
    setError("");
    try {
      await put("/whatsapp/chats/archive", { chatId: selectedChat.id, archived: !selectedChat.archived });
      chats.reload();
      notify(selectedChat.archived ? "Conversa desarquivada." : "Conversa arquivada.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setArchiving(false);
    }
  }
  return (
    <>
      {!backup && <Connection />}
      {(error || chats.error) && (
        <ErrorBox message={error || chats.error} retry={chats.reload} />
      )}
      <section className="panel chat-layout">
        <aside className="chat-sidebar">
          <div className="chat-search">
            <div className="search-field">
              <Search size={16} />
              <input
                placeholder="Buscar conversa…"
                aria-label="Buscar conversa"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {!backup && (
              <button
                className="text-button"
                style={{ marginTop: 10 }}
                onClick={() => {
                  const phone = window.prompt(
                    "Telefone com DDI e DDD (ex.: 5551999999999)",
                  );
                  if (phone && /^\d{12,15}$/.test(phone.replace(/\D/g, "")))
                    setChat({
                      id: phone.replace(/\D/g, "") + "@s.whatsapp.net",
                      name: phone,
                      lastText: "",
                      updatedAt: Date.now(),
                      archived: false,
                      pinnedAt: 0,
                    });
                  else if (phone)
                    setError("Informe um telefone válido com DDI e DDD.");
                }}
              >
                <Plus size={13} />
                Nova conversa
              </button>
            )}
          </div>
          {!backup && (
            <div className="chat-view-options" role="group" aria-label="Visualizações das conversas">
              {chatViews.map((view) => (
                <button
                  key={view.id}
                  type="button"
                  aria-pressed={views.includes(view.id)}
                  aria-disabled={views.length === 1 && views.includes(view.id)}
                  onClick={() => setViews((current) => current.includes(view.id)
                    ? current.length === 1 ? current : current.filter((id) => id !== view.id)
                    : [...current, view.id])}
                >
                  {view.label}
                </button>
              ))}
            </div>
          )}
          <div className="chat-items">
            {chats.loading && !chats.data ? (
              <Loading />
            ) : !chats.data?.length ? (
              <Empty
                title="Sem conversas ainda"
                description={
                  backup
                    ? "As mensagens armazenadas aparecem aqui."
                    : "Conecte o WhatsApp para sincronizar suas conversas."
                }
              />
            ) : (
              <ChatList
                chats={chats.data}
                views={backup ? undefined : views}
                search={search}
                selected={chat?.id}
                pictureUrl={backup ? undefined : pictureUrl}
                onSelect={setChat}
                onOpenPhoto={backup ? undefined : openProfilePhoto}
              />
            )}
          </div>
        </aside>
        {chat ? (
          <div className="chat-main">
            <div className="chat-top">
              {backup ? <Avatar name={selectedChat?.name || chat.name} /> : <button
                type="button"
                className="profile-photo-button"
                aria-label={`Abrir foto de perfil de ${chat.name}`}
                onClick={() => openProfilePhoto(chat)}
              >
                <Avatar name={chat.name} src={pictureUrl(chat.id)} eager />
              </button>}
              <div>
                <div className="chat-top-name">
                  <h3>{linkedLead?.name || selectedChat?.name || chat.name.split("@")[0]}</h3>
                  {selectedLeadStatus && <Badge status={selectedLeadStatus} />}
                </div>
                <p>
                  {chat.id.split("@")[0]}{" "}
                  {linkedLead ? "· Vinculado ao CRM" : ""}
                </p>
              </div>
              <ContactButton chatId={chat.id} backup={backup} saved={!!(selectedChat?.contactSaved || chat.contactSaved)} onClick={() => setContactChatId(chat.id)} />
              {!backup && selectedChat && (
                <button
                  type="button"
                  className="button secondary compact"
                  disabled={archiving || chats.loading}
                  onClick={() => void toggleArchived()}
                >
                  {selectedChat.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                  {archiving ? "Salvando…" : selectedChat.archived ? "Desarquivar" : "Arquivar"}
                </button>
              )}
              {!backup && classificationLeadId && <Classifications key={classificationLeadId} leadId={classificationLeadId} onSaved={chats.reload} />}
              {!backup &&
                chat.id.endsWith("@s.whatsapp.net") &&
                (matchedLead ? (
                  <>
                    <button
                      className="text-button"
                      onClick={() => setEditingLead(matchedLead)}
                    >
                      Abrir lead
                    </button>
                    {!matchedLead.chatId && (
                      <button
                        className="icon-button"
                        aria-label="Vincular lead"
                        onClick={() => void link()}
                      >
                        <Link2 size={17} />
                      </button>
                    )}
                  </>
                ) : (
                  <button
                    className="button secondary compact"
                    onClick={() => setCreate(true)}
                  >
                    <Plus size={14} />
                    Criar lead
                  </button>
                ))}
            </div>
            <Conversation
              key={`${chat.id}-${historyUser}`}
              chatId={chat.id}
              userId={backup ? historyUser : undefined}
              backup={backup}
              backupNumber={backup ? backupNumber : undefined}
              chats={chats.data || []}
              onStartConversation={(contact) => void startConversation(contact)}
              onRead={chats.reload}
            />
          </div>
        ) : (
          <div className="chat-main">
            <Empty
              title={
                backup
                  ? "Uma história em cada conversa"
                  : "Vamos começar uma boa conversa?"
              }
              description="Selecione um contato ao lado para consultar o histórico de mensagens."
            />
          </div>
        )}
      </section>
      {contactChatId && !backup && (
        <ContactForm key={contactChatId} chatId={contactChatId} linkedLead={!!(linkedLead || selectedChat?.leadId)} onClose={() => setContactChatId(undefined)} onSaved={(contact) => {
          setContactChatId(undefined);
          setChat((current) => current?.id === contact.chatId ? { ...current, name: current.leadId ? current.name : contact.fullName, contactSaved: true } : current);
          chats.reload();
        }} />
      )}
      {profilePhoto && (
        <Modal
          title={`Foto de perfil · ${profilePhoto.name}`}
          onClose={() => setProfilePhoto(undefined)}
        >
          <div className="profile-photo-viewer">
            {photoFailed ? (
              <Empty
                title="Foto de perfil indisponível"
                description="Este contato não possui uma foto disponível para visualização."
              />
            ) : (
              <img
                src={profilePhoto.src}
                alt={`Foto de perfil de ${profilePhoto.name}`}
                onError={() => setPhotoFailed(true)}
              />
            )}
          </div>
        </Modal>
      )}
      {phoneVariant && (
        <Modal title="Número alternativo encontrado" onClose={() => setPhoneVariant(undefined)}>
          <div className="modal-form">
            <p>
              O WhatsApp identificou a variação +{phoneVariant.phone} para o número +{phoneVariant.original}.
              Deseja abrir a conversa com essa variação?
            </p>
            <div className="modal-footer">
              <button type="button" className="button secondary" onClick={() => setPhoneVariant(undefined)}>
                Cancelar
              </button>
              <button type="button" className="button primary" onClick={() => {
                setChat(phoneVariant.chat);
                setPhoneVariant(undefined);
              }}>
                Abrir conversa
              </button>
            </div>
          </div>
        </Modal>
      )}
      {(create || editingLead) && chat && (
        <LeadForm
          lead={editingLead}
          initial={{
            name: chat.name.includes("@") ? "" : chat.name,
            phone: chat.id.split("@")[0],
          }}
          onClose={() => {
            setCreate(false);
            setEditingLead(undefined);
          }}
          onSaved={async (lead) => {
            setCreate(false);
            setEditingLead(undefined);
            if (lead.currentSellerId === user?.id && !lead.chatId) {
              try {
                await post(`/leads/${lead.id}/link`, { chatId: chat.id });
              } catch (e) {
                setError((e as Error).message);
              }
            }
            leadMatch.reload();
            chats.reload();
          }}
        />
      )}
    </>
  );
}
