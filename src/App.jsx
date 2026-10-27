import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  CornerDownRight,
  Feather,
  Flag,
  Heart,
  Leaf,
  LoaderCircle,
  LockKeyhole,
  MessageCircle,
  MessagesSquare,
  Moon,
  MoreHorizontal,
  Plus,
  Quote,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { api, privateKeys, relativeTime } from './api.js';

const CATEGORIES = ['Thoughts', 'Confessions', 'Questions', 'Random'];
const CATEGORY_ICONS = {
  Thoughts: Feather,
  Confessions: LockKeyhole,
  Questions: CircleHelp,
  Random: Sparkles,
};
const FILTERS = [
  { id: 'newest', name: 'Newest', icon: Clock3 },
  { id: 'discussed', name: 'Most discussed', icon: MessagesSquare },
  { id: 'unanswered', name: 'Unanswered', icon: CircleHelp },
];
const countChars = (value) => Array.from(value).length;

function Logo({ small = false }) {
  return (
    <span className={`brand ${small ? 'brand-small' : ''}`}>
      <span className="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 32 32">
          <path d="M8 7v11c0 11 16 11 16 0V7" />
          <path d="m11 26-2 4 8-4" />
        </svg>
      </span>
      <span>
        unsaid<span className="brand-period">.</span>
      </span>
    </span>
  );
}
function Spinner() {
  return <LoaderCircle className="spin" size={17} aria-hidden="true" />;
}
function ErrorNote({ children }) {
  return children ? (
    <p className="error-note" role="alert">
      {children}
    </p>
  ) : null;
}
function Avatar({ alias, small }) {
  const tone = [...alias].reduce((sum, c) => sum + c.charCodeAt(0), 0) % 5;
  return (
    <span className={`avatar avatar-${tone} ${small ? 'avatar-small' : ''}`} aria-hidden="true">
      <Moon size={small ? 15 : 18} strokeWidth={1.5} />
      <span className="avatar-star">✦</span>
    </span>
  );
}
function Time({ timestamp }) {
  return (
    <time dateTime={new Date(timestamp).toISOString()} title={new Date(timestamp).toLocaleString()}>
      {relativeTime(timestamp)}
    </time>
  );
}
function Modal({ title, children, onClose, className = '' }) {
  const ref = useRef(null);
  const titleId = `modal-${title.toLowerCase().replace(/[^a-z]/g, '')}`;
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement;
    dialog.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      previous?.focus?.();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${className}`}
      aria-labelledby={titleId}
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === ref.current) {
          const r = ref.current.getBoundingClientRect();
          if (
            event.clientX < r.left ||
            event.clientX > r.right ||
            event.clientY < r.top ||
            event.clientY > r.bottom
          )
            onClose();
        }
      }}
    >
      <div className="modal-heading">
        <h2 id={titleId}>{title}</h2>
        <button className="icon-button" aria-label="Close dialog" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function Menu({ type, item, onAction }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const trigger = useRef(null);
  useEffect(() => {
    if (!open) return;
    ref.current.querySelector('[role="menuitem"]')?.focus();
    const outside = (event) => {
      if (!ref.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  return (
    <div className="item-menu" ref={ref}>
      <button
        ref={trigger}
        className="icon-button menu-trigger"
        aria-label={`Options for ${type === 'post' ? 'message' : 'reply'} by ${item.alias}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <MoreHorizontal size={20} />
      </button>
      {open && (
        <div
          className="dropdown"
          role="menu"
          onKeyDown={(event) => {
            if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
              event.preventDefault();
              const items = [...ref.current.querySelectorAll('[role="menuitem"]')];
              const index = items.indexOf(document.activeElement);
              items[
                (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
              ]?.focus();
            }
          }}
        >
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onAction({ action: 'report', type, item });
            }}
          >
            <Flag size={15} />
            Report {type === 'post' ? 'message' : 'reply'}
          </button>
          {privateKeys.owns(type, item.id) && (
            <button
              className="danger-text"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onAction({ action: 'delete', type, item });
              }}
            >
              <Trash2 size={15} />
              Delete your {type === 'post' ? 'message' : 'reply'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
function HeartButton({ type, item, notify, refresh }) {
  const [liked, setLiked] = useState(() => privateKeys.heart(type, item.id).liked);
  const [busy, setBusy] = useState(false);
  const [override, setOverride] = useState(null);
  useEffect(() => {
    setOverride(null);
  }, [item.hearts]);
  useEffect(() => {
    const listener = () => setLiked(privateKeys.heart(type, item.id).liked);
    window.addEventListener('storage', listener);
    return () => window.removeEventListener('storage', listener);
  }, [type, item.id]);
  async function toggle() {
    if (busy) return;
    setBusy(true);
    const prior = privateKeys.heart(type, item.id);
    const token = prior.token || privateKeys.token();
    try {
      privateKeys.saveHeart(type, item.id, { token, liked: Boolean(prior.liked) });
      const data = await api(`/content/${type}/${item.id}/heart`, {
        method: 'PUT',
        body: { token, liked: !liked },
      });
      privateKeys.saveHeart(type, item.id, { token, liked: data.liked });
      setLiked(data.liked);
      setOverride(data.hearts);
      refresh();
    } catch (error) {
      notify(error.message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      className={`reaction-button ${liked ? 'is-liked' : ''}`}
      aria-label={liked ? 'Remove heart' : 'Send a heart'}
      aria-pressed={liked}
      disabled={busy}
      onClick={toggle}
    >
      <Heart size={17} fill={liked ? 'currentColor' : 'none'} strokeWidth={1.6} />
      <span>{override ?? item.hearts}</span>
      <span className="heart-word">{type === 'post' ? 'hearts' : ''}</span>
    </button>
  );
}
function Composer({ inputRef, category, setCategory, onCreated, notify }) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const count = countChars(body);
  async function submit(event) {
    event.preventDefault();
    if (busy || !body.trim() || count > 3000) return;
    setBusy(true);
    setError('');
    try {
      const keys = privateKeys.prepare();
      const { post } = await api('/posts', { method: 'POST', body: { body, category, ...keys } });
      privateKeys.remember('post', post.id, keys.deletionToken, post.id, keys.threadToken);
      setBody('');
      onCreated(post);
      notify('Your thought has a place here.');
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="compose-section" id="compose" aria-label="Share an anonymous thought">
      <form className="composer" onSubmit={submit}>
        <div className="composer-top">
          <span>
            <Feather size={17} strokeWidth={1.6} />
            <label htmlFor="thought">A little space for what’s on your mind</label>
          </span>
          <span className="anonymous-label">
            <LockKeyhole size={12} />
            Always anonymous
          </span>
        </div>
        <textarea
          id="thought"
          ref={inputRef}
          aria-label="What’s on your mind?"
          placeholder="What’s on your mind?"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
              event.preventDefault();
              event.currentTarget.form.requestSubmit();
            }
          }}
          aria-describedby="composer-hint thought-counter"
          rows={3}
        />
        <div className="composer-categories" role="group" aria-label="Choose a category">
          {CATEGORIES.map((name) => {
            const Icon = CATEGORY_ICONS[name];
            return (
              <button
                key={name}
                className={`category-button category-${name.toLowerCase()} ${category === name ? 'selected' : ''}`}
                type="button"
                aria-pressed={category === name}
                onClick={() => setCategory(name)}
              >
                <Icon size={13} />
                {name}
              </button>
            );
          })}
        </div>
        <div className="composer-bottom">
          <span id="composer-hint" className="composer-hint">
            Big feelings. Small thoughts. All welcome.
          </span>
          <div className="compose-submit">
            <span
              id="thought-counter"
              className={`char-counter ${count > 3000 ? 'over-limit' : ''}`}
              aria-live={count > 2800 ? 'polite' : 'off'}
            >
              {count.toLocaleString()}
              <span> / 3,000</span>
            </span>
            <button
              className="primary-button"
              disabled={busy || !body.trim() || count > 3000}
              type="submit"
            >
              {busy ? (
                <>
                  <Spinner />
                  Sharing…
                </>
              ) : (
                <>
                  Let it out
                  <ArrowUpRight size={17} />
                </>
              )}
            </button>
          </div>
        </div>
        <ErrorNote>{error}</ErrorNote>
      </form>
      <p className="privacy-note">
        <ShieldCheck size={13} />
        No names. No profiles. Just a little honesty.
      </p>
    </section>
  );
}
function Comment({ item, notify, refresh, onAction, onReply }) {
  return (
    <article className="comment" id={`reply-${item.id}`} aria-label={`Reply by ${item.alias}`}>
      <Avatar alias={item.alias} small />
      <div className="comment-main">
        <div className="comment-heading">
          <strong>{item.alias}</strong>
          {item.isOp && <span className="op-badge">OP</span>}
          <Time timestamp={item.createdAt} />
          <Menu type="comment" item={item} onAction={onAction} />
        </div>
        {item.parentAlias && (
          <button
            className="reply-reference"
            onClick={() => {
              if (item.parentId)
                document
                  .getElementById(`reply-${item.parentId}`)
                  ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }}
            disabled={!item.parentId}
          >
            <CornerDownRight size={12} />
            Replying to {item.parentAlias}
            {!item.parentId && ' · reply removed'}
          </button>
        )}
        <p className="message-body comment-body">{item.body}</p>
        <div className="comment-actions">
          <HeartButton type="comment" item={item} notify={notify} refresh={refresh} />
          <button className="text-button" onClick={() => onReply(item)}>
            <MessageCircle size={13} />
            Reply
          </button>
        </div>
      </div>
    </article>
  );
}
function Thread({ post, revision, notify, refresh, onAction, onClose }) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [body, setBody] = useState('');
  const [target, setTarget] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const input = useRef(null);
  const count = countChars(body);
  useEffect(() => {
    const controller = new AbortController();
    api(`/posts/${post.id}/comments`, { signal: controller.signal })
      .then((data) => {
        setComments(data.comments);
        setLoadError('');
        setLoading(false);
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          setLoadError(error.message);
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [post.id, revision, retry]);
  async function submit(event) {
    event.preventDefault();
    if (busy || !body.trim() || count > 2000) return;
    setBusy(true);
    setError('');
    try {
      const keys = privateKeys.prepare();
      const threadToken = privateKeys.thread(post.id) || keys.threadToken;
      const { comment } = await api(`/posts/${post.id}/comments`, {
        method: 'POST',
        body: {
          body,
          parentId: target?.id || null,
          deletionToken: keys.deletionToken,
          threadToken,
        },
      });
      privateKeys.remember('comment', comment.id, keys.deletionToken, post.id, threadToken);
      setComments((current) => [...current.filter((c) => c.id !== comment.id), comment]);
      setBody('');
      setTarget(null);
      refresh();
      notify('A little connection made.');
      input.current?.focus();
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="thread" aria-label={`Replies to ${post.alias}`}>
      <div className="thread-heading">
        <span>
          The conversation <span className="thread-count">{post.replyCount}</span>
        </span>
        <button className="icon-button" aria-label="Collapse conversation" onClick={onClose}>
          <X size={15} />
        </button>
      </div>
      {loading ? (
        <div className="thread-loading" role="status">
          <Spinner />
          Finding the conversation…
        </div>
      ) : loadError ? (
        <div>
          <ErrorNote>{loadError}</ErrorNote>
          <button className="text-button" onClick={() => setRetry(retry + 1)}>
            <RefreshCw size={13} />
            Try again
          </button>
        </div>
      ) : comments.length ? (
        <div className="comments">
          {comments.map((item) => (
            <Comment
              key={item.id}
              item={item}
              notify={notify}
              refresh={refresh}
              onAction={onAction}
              onReply={(item) => {
                setTarget({ id: item.id, alias: item.alias });
                input.current?.focus();
              }}
            />
          ))}
        </div>
      ) : (
        <p className="no-replies">
          Sometimes, a few words make all the difference. Be the first to reply.
        </p>
      )}
      <form className="reply-composer" onSubmit={submit}>
        {target && (
          <div className="replying-to">
            <CornerDownRight size={13} />
            <span>
              Replying to <strong>{target.alias}</strong>
            </span>
            <button
              className="icon-button"
              type="button"
              aria-label="Cancel replying to this comment"
              onClick={() => setTarget(null)}
            >
              <X size={14} />
            </button>
          </div>
        )}
        <label className="sr-only" htmlFor={`reply-input-${post.id}`}>
          Write an anonymous reply
        </label>
        <textarea
          ref={input}
          id={`reply-input-${post.id}`}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="A thought, a kind word, a different perspective…"
          rows={2}
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
              event.preventDefault();
              event.currentTarget.form.requestSubmit();
            }
          }}
        />
        <div className="reply-composer-bottom">
          <span className="reply-anonymous">
            <LockKeyhole size={11} />
            Your alias stays in this thread
          </span>
          <span className={`char-counter ${count > 2000 ? 'over-limit' : ''}`}>
            {count.toLocaleString()} / 2,000
          </span>
          <button
            className="primary-button reply-submit"
            disabled={busy || !body.trim() || count > 2000}
          >
            {busy ? (
              <Spinner />
            ) : (
              <>
                Reply
                <ArrowUpRight size={14} />
              </>
            )}
          </button>
        </div>
        <ErrorNote>{error}</ErrorNote>
      </form>
    </section>
  );
}
function PostCard({ post, revision, notify, refresh, onAction }) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const Icon = CATEGORY_ICONS[post.category];
  return (
    <article
      className={`post-card ${open ? 'thread-open' : ''}`}
      aria-label={`Message by ${post.alias}`}
    >
      <div className="post-inner">
        <div className="post-heading">
          <Avatar alias={post.alias} />
          <div className="post-author">
            <div>
              <strong>{post.alias}</strong>
              <span className="author-dot">·</span>
              <Time timestamp={post.createdAt} />
            </div>
            <span className="anonymous-caption">a passing voice</span>
          </div>
          <span className={`category-label category-${post.category.toLowerCase()}`}>
            <Icon size={11} />
            {post.category}
          </span>
          <Menu type="post" item={post} onAction={onAction} />
        </div>
        <p
          className={`message-body post-body ${!expanded && post.body.length > 600 ? 'clamped' : ''}`}
        >
          {post.body}
        </p>
        {post.body.length > 600 && (
          <button className="read-more text-button" onClick={() => setExpanded(!expanded)}>
            {expanded ? 'A little less' : 'Read the whole thought'}
            <ChevronDown size={13} className={expanded ? 'rotate' : ''} />
          </button>
        )}
        <div className="post-actions">
          <HeartButton type="post" item={post} notify={notify} refresh={refresh} />
          <button
            className={`reply-toggle ${open ? 'active' : ''}`}
            onClick={() => setOpen(!open)}
            aria-expanded={open}
          >
            <MessageCircle size={17} strokeWidth={1.6} />
            {post.replyCount
              ? `${post.replyCount} ${post.replyCount === 1 ? 'reply' : 'replies'}`
              : 'Be the first to reply'}
            {post.replyCount > 0 && <ChevronDown size={12} className={open ? 'rotate' : ''} />}
          </button>
          <span className="post-kindness">A little kindness goes a long way.</span>
        </div>
      </div>
      {open && (
        <Thread
          post={post}
          revision={revision}
          notify={notify}
          refresh={refresh}
          onAction={onAction}
          onClose={() => setOpen(false)}
        />
      )}
    </article>
  );
}
function ActionModal({ action, onClose, notify, refresh }) {
  const [reason, setReason] = useState('Harmful content');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const deleting = action.action === 'delete';
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const path = `/content/${action.type}/${action.item.id}`;
      if (deleting) {
        await api(path, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${privateKeys.deletion(action.type, action.item.id)}` },
        });
        privateKeys.forget(action.type, action.item.id);
        refresh();
        notify('Your words have been removed.');
      } else {
        await api(`${path}/report`, {
          method: 'POST',
          body: { reason, details, token: privateKeys.report(action.type, action.item.id) },
        });
        notify('Thank you. Your report is in the moderation queue.');
      }
      onClose();
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={deleting ? 'Let this one go?' : 'Help keep this space safe'} onClose={onClose}>
      <form onSubmit={submit}>
        {deleting ? (
          <>
            <p>
              Your {action.type === 'post' ? 'message and its entire reply thread' : 'reply'} will
              be permanently removed. This can’t be undone.
            </p>
            <blockquote className="delete-preview">{action.item.body}</blockquote>
          </>
        ) : (
          <>
            <p>
              Reports go to the site administrator for review. Text is never automatically censored
              or rewritten.
            </p>
            <label className="field-label" htmlFor="report-reason">
              What’s the concern?
            </label>
            <select
              id="report-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            >
              {['Harmful content', 'Spam', 'Personal information', 'Other'].map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
            <label className="field-label" htmlFor="report-details">
              Anything else? <span>(optional)</span>
            </label>
            <textarea
              id="report-details"
              rows={3}
              maxLength={500}
              placeholder="A little context helps. Please don’t include personal information."
              value={details}
              onChange={(event) => setDetails(event.target.value)}
            />
          </>
        )}
        <ErrorNote>{error}</ErrorNote>
        <div className="modal-actions">
          <button className="secondary-button" type="button" onClick={onClose}>
            Keep it here
          </button>
          <button className={`primary-button ${deleting ? 'delete-button' : ''}`} disabled={busy}>
            {busy ? <Spinner /> : deleting ? <Trash2 size={15} /> : <Flag size={15} />}
            {deleting ? 'Delete permanently' : 'Send report'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function InfoModal({ kind, onClose }) {
  return (
    <Modal
      title={
        kind === 'privacy' ? 'Anonymous, with a little clarity.' : 'A little care goes a long way.'
      }
      onClose={onClose}
    >
      <div className="prose">
        {kind === 'privacy' ? (
          <>
            <span className="modal-symbol">
              <ShieldCheck size={27} strokeWidth={1.3} />
            </span>
            <h3>No account. No public identity.</h3>
            <p>
              Unsaid doesn’t ask for your name, email, or a profile. A random alias stays consistent
              in one conversation and a new alias is assigned in each new thread. Your words are
              public.
            </p>
            <h3>Your browser holds the keys.</h3>
            <p>
              Private deletion keys and thread keys stay in this browser’s storage. They let you
              delete your words and keep your thread alias. Clearing browser data, using a different
              device, or using private browsing can lose those keys. There is no account recovery.
            </p>
            <h3>Anonymity has limits.</h3>
            <p>
              Other visitors can’t see your network address or private keys. Like any website, the
              hosting provider may process connection details. The server uses a temporary in-memory
              hash of your network address to limit spam. This does not make you technically
              untraceable.
            </p>
            <p>
              There are no advertising trackers. Avoid posting identifying information about
              yourself or others. Hearts are limited per browser key, not per person.
            </p>
          </>
        ) : (
          <>
            <span className="modal-symbol">
              <Leaf size={27} strokeWidth={1.3} />
            </span>
            <h3>Be honest. Be human. Be kind.</h3>
            <p>
              You don’t have to have the right words here. Share your thoughts as they are, and give
              others the space to do the same. Disagreement is welcome; targeted harassment,
              threats, and exploitation aren’t.
            </p>
            <h3>Protect each other’s privacy.</h3>
            <p>
              Don’t share private information, identifying details about others, or illegal content.
              Use the discreet report option if something needs the administrator’s attention.
            </p>
            <h3>A conversation, not a crisis service.</h3>
            <p>
              If you or someone else is in immediate danger, contact your local emergency service or
              a trusted person nearby. Unsaid is a public community and isn’t monitored
              continuously.
            </p>
            <p>
              We don’t filter profanity, replace your words, or rewrite what you say. The
              administrator can remove abusive or illegal content after review.
            </p>
          </>
        )}
      </div>
      <button className="primary-button modal-done" onClick={onClose}>
        A little clearer
        <Check size={15} />
      </button>
    </Modal>
  );
}
function AdminModal({ onClose, notify, refresh }) {
  const [key, setKey] = useState('');
  const [reports, setReports] = useState(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [targetType, setTargetType] = useState('post');
  const [targetId, setTargetId] = useState('');
  const [confirm, setConfirm] = useState(null);
  async function load(event) {
    event?.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = await api('/admin/reports', { headers: { Authorization: `Bearer ${key}` } });
      setReports(data.reports);
      setTotal(data.total);
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }
  async function moderate(path, method) {
    setBusy(true);
    setError('');
    try {
      await api(path, {
        method,
        headers: { Authorization: `Bearer ${key}` },
        ...(method === 'POST' ? { body: {} } : {}),
      });
      setConfirm(null);
      setTargetId('');
      refresh();
      await load();
      notify(
        method === 'DELETE' ? 'Content removed from the community.' : 'Report marked as reviewed.',
      );
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="A little care behind the scenes" className="admin-modal" onClose={onClose}>
      <p>
        Administrator access only. The key is kept in memory for this dialog and is never saved in
        browser storage.
      </p>
      <form className="admin-auth" onSubmit={load}>
        <label className="field-label" htmlFor="admin-key">
          Administrator key
        </label>
        <div>
          <input
            id="admin-key"
            type="password"
            autoComplete="off"
            required
            value={key}
            onChange={(event) => {
              setKey(event.target.value);
              setReports(null);
            }}
          />
          <button className="primary-button" disabled={busy}>
            {busy ? <Spinner /> : 'Open queue'}
          </button>
        </div>
      </form>
      <ErrorNote>{error}</ErrorNote>
      {reports !== null && (
        <>
          <h3 className="admin-queue-title">
            Reports to review <span>{total}</span>
          </h3>
          {reports.length === 0 ? (
            <p className="no-replies">A quiet queue. There’s nothing to review.</p>
          ) : (
            reports.map((report) => (
              <article className="admin-report" key={report.id}>
                <div>
                  <strong>{report.reason}</strong>
                  <Time timestamp={report.createdAt} />
                </div>
                <p className="message-body">{report.body || 'Content already removed.'}</p>
                {report.details && <p className="report-details">Report note: {report.details}</p>}
                <p className="admin-target">
                  {report.targetType} · {report.targetId}
                </p>
                <div className="admin-report-actions">
                  <button
                    className="secondary-button"
                    disabled={busy}
                    onClick={() => moderate(`/admin/reports/${report.id}/resolve`, 'POST')}
                  >
                    Dismiss report
                  </button>
                  <button
                    className="danger-text text-button"
                    disabled={busy}
                    onClick={() => setConfirm({ type: report.targetType, id: report.targetId })}
                  >
                    <Trash2 size={14} />
                    Remove content
                  </button>
                </div>
              </article>
            ))
          )}
          {reports.length < total && (
            <p className="muted-text">
              Showing the oldest 100 reports. Review these to continue through the queue.
            </p>
          )}
          <details className="direct-moderation">
            <summary>Remove content by public reference</summary>
            <p>
              Use the public message reference from the moderation queue or the content’s browser
              network response. Internal database keys and participant keys are never exposed.
            </p>
            <label className="field-label" htmlFor="target-type">
              Content type
            </label>
            <select
              id="target-type"
              value={targetType}
              onChange={(event) => setTargetType(event.target.value)}
            >
              <option value="post">Message and its replies</option>
              <option value="comment">Single reply</option>
            </select>
            <label className="field-label" htmlFor="target-id">
              Public content reference
            </label>
            <input
              id="target-id"
              value={targetId}
              onChange={(event) => setTargetId(event.target.value)}
            />
            <button
              className="secondary-button"
              disabled={!/^[A-Za-z0-9_-]{22}$/.test(targetId) || busy}
              onClick={() => setConfirm({ type: targetType, id: targetId })}
            >
              Review removal
            </button>
          </details>
        </>
      )}
      {confirm && (
        <div className="admin-confirm" role="alert">
          <p>
            Permanently remove this{' '}
            {confirm.type === 'post' ? 'message and all its replies' : 'reply'}?
          </p>
          <button className="secondary-button" onClick={() => setConfirm(null)}>
            Cancel
          </button>
          <button
            className="primary-button delete-button"
            disabled={busy}
            onClick={() => moderate(`/admin/content/${confirm.type}/${confirm.id}`, 'DELETE')}
          >
            Confirm removal
          </button>
        </div>
      )}
    </Modal>
  );
}

export default function App() {
  const [category, setCategory] = useState('Thoughts');
  const [filter, setFilter] = useState('newest');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [posts, setPosts] = useState([]);
  const [total, setTotal] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [connection, setConnection] = useState('connecting');
  const [toast, setToast] = useState(null);
  const [action, setAction] = useState(null);
  const [info, setInfo] = useState(null);
  const inputRef = useRef(null);
  const toastTimer = useRef(null);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  const notify = useCallback((message, error = false) => {
    clearTimeout(toastTimer.current);
    setToast({ message, error });
    toastTimer.current = setTimeout(() => setToast(null), error ? 7500 : 4500);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search);
      setPageCount(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    let pending;
    const events = new EventSource('/api/events');
    events.addEventListener('ready', () => {
      setConnection('live');
      refresh();
    });
    events.addEventListener('change', () => {
      clearTimeout(pending);
      pending = setTimeout(refresh, 120);
    });
    events.onerror = () => setConnection('reconnecting');
    const interval = setInterval(() => {
      if (events.readyState !== EventSource.OPEN) refresh();
    }, 20_000);
    const visible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', visible);
    return () => {
      events.close();
      clearTimeout(pending);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [refresh]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    Promise.all(
      Array.from({ length: pageCount }, (_, i) =>
        api(`/posts?filter=${filter}&q=${encodeURIComponent(query)}&limit=20&offset=${i * 20}`, {
          signal: controller.signal,
        }),
      ),
    )
      .then((pages) => {
        setPosts(pages.flatMap((p) => p.posts));
        setTotal(pages[0].total);
        setHasMore(pages.at(-1).hasMore);
        setError('');
        setLoading(false);
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          setError(error.message);
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [filter, query, pageCount, revision]);
  useEffect(() => {
    const timer = setInterval(() => setPosts((p) => [...p]), 60_000);
    return () => clearInterval(timer);
  }, []);
  const focusComposer = () => {
    document.getElementById('compose').scrollIntoView({ behavior: 'smooth', block: 'center' });
    inputRef.current?.focus({ preventScroll: true });
  };
  function created(post) {
    setFilter('newest');
    setSearch('');
    setQuery('');
    setPageCount(1);
    setPosts((current) => [post, ...current.filter((p) => p.id !== post.id)]);
    refresh();
  }
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to the conversation
      </a>
      <div className="ambient-glow" aria-hidden="true" />
      <header className="site-header">
        <a className="home-link" href="/" aria-label="Unsaid home">
          <Logo />
        </a>
        <span className="header-note">
          <span className="tiny-star">✧</span>a little less alone
        </span>
        <button
          className="header-privacy"
          onClick={() => setInfo('privacy')}
          aria-label="About privacy and anonymity"
        >
          <ShieldCheck size={17} />
          <span>A safe space to be you</span>
        </button>
      </header>
      <main id="main">
        <section className="hero">
          <div className="hero-eyebrow">
            <span />
            FOR THE THINGS YOU HAVEN’T SAID
          </div>
          <h1>
            Some things are easier
            <br className="desktop-break" /> said <em>anonymously.</em>
          </h1>
          <p>Leave a thought. Find a conversation.</p>
          <div className="hero-sparkle sparkle-one" aria-hidden="true">
            ✧
          </div>
          <div className="hero-sparkle sparkle-two" aria-hidden="true">
            ✦
          </div>
          <div className="hero-sparkle sparkle-three" aria-hidden="true">
            +
          </div>
        </section>
        <div className="feed-container">
          <Composer
            inputRef={inputRef}
            category={category}
            setCategory={setCategory}
            onCreated={created}
            notify={notify}
          />
          <section className="feed-section" aria-label="Anonymous message feed">
            <div className="feed-title-row">
              <h2>
                Voices in the quiet<span>.</span>
              </h2>
              <span
                className={`live-status ${connection === 'live' ? '' : 'not-live'}`}
                title="Conversations update automatically"
              >
                <span />
                {connection === 'live'
                  ? 'Live conversations'
                  : connection === 'connecting'
                    ? 'Connecting…'
                    : 'Reconnecting…'}
              </span>
            </div>
            <div className="feed-toolbar">
              <div className="feed-tabs" role="group" aria-label="Filter conversations">
                {FILTERS.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      className={filter === item.id ? 'active' : ''}
                      aria-pressed={filter === item.id}
                      onClick={() => {
                        setFilter(item.id);
                        setPageCount(1);
                      }}
                    >
                      <Icon size={14} />
                      {item.name}
                    </button>
                  );
                })}
              </div>
              <div className="search-field">
                <Search size={15} aria-hidden="true" />
                <input
                  type="search"
                  aria-label="Search conversations"
                  placeholder="Find a thought…"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  maxLength={200}
                />
                {search && (
                  <button
                    className="search-clear"
                    aria-label="Clear search"
                    onClick={() => setSearch('')}
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            </div>
            <div className="feed-meta" aria-live="polite">
              <span>
                {query
                  ? `${total} ${total === 1 ? 'conversation' : 'conversations'} matching “${query}”`
                  : filter === 'unanswered'
                    ? 'A few words could mean a lot to someone.'
                    : filter === 'discussed'
                      ? 'The thoughts bringing us together.'
                      : 'Different lives. Shared feelings.'}
              </span>
              <span>
                {total.toLocaleString()} {total === 1 ? 'thought' : 'thoughts'}
              </span>
            </div>
            {error && (
              <div className="feed-error">
                <MessageCircle size={24} />
                <h3>A little trouble connecting.</h3>
                <p role="alert">{error}</p>
                <button className="secondary-button" onClick={refresh}>
                  <RefreshCw size={14} />
                  Try again
                </button>
              </div>
            )}
            {loading && !posts.length && !error ? (
              <div className="skeleton-list" role="status" aria-label="Loading conversations">
                {[1, 2].map((n) => (
                  <div className="skeleton-card" key={n}>
                    <div className="skeleton-author" />
                    <div className="skeleton-line" />
                    <div className="skeleton-line short" />
                    <div className="skeleton-bottom" />
                  </div>
                ))}
              </div>
            ) : !posts.length && !error ? (
              <div className="empty-state">
                <div className="empty-orbit" aria-hidden="true">
                  <span />
                  <Quote size={28} strokeWidth={1} />
                  <i>✦</i>
                </div>
                <h3>
                  {query
                    ? 'The right words are still out there.'
                    : filter === 'unanswered'
                      ? 'No thought left hanging.'
                      : 'Every conversation starts with a little courage.'}
                </h3>
                <p>
                  {query
                    ? 'Try a different word, or leave a thought of your own.'
                    : filter === 'unanswered'
                      ? 'Every thought has a reply. You can always begin a new conversation.'
                      : 'This space is still quiet. Your words could be the beginning of something.'}
                </p>
                {query ? (
                  <button className="secondary-button" onClick={() => setSearch('')}>
                    Clear search
                  </button>
                ) : (
                  <button className="empty-compose" onClick={focusComposer}>
                    Be the first voice
                    <ArrowUpRight size={15} />
                  </button>
                )}
              </div>
            ) : (
              <div className="post-list" aria-busy={loading}>
                {posts.map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    revision={revision}
                    notify={notify}
                    refresh={refresh}
                    onAction={setAction}
                  />
                ))}
              </div>
            )}
            {hasMore && (
              <button
                className="load-more secondary-button"
                disabled={loading}
                onClick={() => setPageCount((n) => n + 1)}
              >
                {loading ? <Spinner /> : <ArrowDown size={15} />}A few more thoughts
              </button>
            )}
            <div className="quiet-reminder">
              <span />
              <Leaf size={14} strokeWidth={1.3} />
              <span />
            </div>
            <p className="quiet-reminder-text">
              You don’t have to have the right words. Just your own.
            </p>
          </section>
          <aside className="community-note">
            <div className="community-icon">
              <Moon size={20} strokeWidth={1.3} />
            </div>
            <div>
              <h3>A small corner of the internet. A little more human.</h3>
              <p>Be honest. Be kind. You never know who needed to hear it.</p>
            </div>
            <span aria-hidden="true">✧</span>
          </aside>
        </div>
      </main>
      <footer className="site-footer">
        <div>
          <Logo small />
          <span>Some things deserve a place to be said.</span>
        </div>
        <nav aria-label="About this space">
          <button onClick={() => setInfo('privacy')}>Privacy & anonymity</button>
          <span>·</span>
          <button onClick={() => setInfo('guidelines')}>Our little ground rules</button>
          <button
            className="moderation-link"
            onClick={() => setInfo('admin')}
            aria-label="Administrator moderation tools"
            title="Moderation tools"
          >
            <ShieldCheck size={14} />
          </button>
        </nav>
      </footer>
      <button
        className="mobile-compose"
        aria-label="Write a new anonymous thought"
        onClick={focusComposer}
      >
        <Plus size={21} />
        <span>Leave a thought</span>
      </button>
      {toast && (
        <div
          className={`toast ${toast.error ? 'toast-error' : ''}`}
          role={toast.error ? 'alert' : 'status'}
        >
          {toast.error ? <MessageCircle size={16} /> : <Check size={16} />}
          <span>{toast.message}</span>
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setToast(null)}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {action && (
        <ActionModal
          key={`${action.action}-${action.item.id}`}
          action={action}
          onClose={() => setAction(null)}
          notify={notify}
          refresh={refresh}
        />
      )}
      {info &&
        (info === 'admin' ? (
          <AdminModal onClose={() => setInfo(null)} notify={notify} refresh={refresh} />
        ) : (
          <InfoModal kind={info} onClose={() => setInfo(null)} />
        ))}
    </>
  );
}
