import { useEffect, useRef } from 'react';
import Cookies from 'js-cookie';
import { useRecoilState } from 'recoil';
import { useGetStartupConfig } from '~/data-provider';
import store from '~/store';

/**
 * Nova OS fork — on first boot, if `interface.defaultLanguage` is set in
 * `librechat.yaml` AND the user hasn't explicitly picked a language
 * (cookie / localStorage `lang` both absent), apply the configured
 * default to the lang atom. The atomWithLocalStorage backing persists
 * that choice, so subsequent visits keep the same locale until the user
 * manually changes it via Settings.
 *
 * Sticky semantics: once applied, the localStorage value wins on every
 * future visit even if the config default changes. Returning users who
 * want to track a config change have to clear their `lang` localStorage
 * key (or pick the new language in Settings).
 *
 * Mounted once at app root from `App.jsx`. Renders nothing.
 */
const StartupLanguageManager = () => {
  const { data: startupConfig } = useGetStartupConfig();
  const [lang, setLang] = useRecoilState(store.lang);
  const appliedRef = useRef(false);

  useEffect(() => {
    if (appliedRef.current) {
      return;
    }
    const configDefault = startupConfig?.interface?.defaultLanguage;
    if (!configDefault) {
      return;
    }
    const userPicked = Cookies.get('lang') || localStorage.getItem('lang');
    if (userPicked) {
      return;
    }
    appliedRef.current = true;
    if (lang !== configDefault) {
      setLang(configDefault);
    }
  }, [startupConfig?.interface?.defaultLanguage, lang, setLang]);

  return null;
};

export default StartupLanguageManager;
