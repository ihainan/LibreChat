import { ThemeSelector } from '@librechat/client';
import { TStartupConfig } from 'librechat-data-provider';
import { ErrorMessage } from '~/components/Auth/ErrorMessage';
import { TranslationKeys, useLocalize } from '~/hooks';
import SocialLoginRender from './SocialLoginRender';
import { BlinkAnimation } from './BlinkAnimation';
import { Banner } from '../Banners';
import Footer from './Footer';

function AuthLayout({
  children,
  isFetching,
  startupConfig,
  startupConfigError,
  pathname,
  error,
}: {
  children: React.ReactNode;
  header: React.ReactNode;
  isFetching: boolean;
  startupConfig: TStartupConfig | null | undefined;
  startupConfigError: unknown | null | undefined;
  pathname: string;
  error: TranslationKeys | null;
}) {
  const localize = useLocalize();

  const hasStartupConfigError = startupConfigError !== null && startupConfigError !== undefined;
  const DisplayError = () => {
    if (hasStartupConfigError) {
      return (
        <div className="mx-auto sm:max-w-sm">
          <ErrorMessage>{localize('com_auth_error_login_server')}</ErrorMessage>
        </div>
      );
    } else if (error === 'com_auth_error_invalid_reset_token') {
      return (
        <div className="mx-auto sm:max-w-sm">
          <ErrorMessage>
            {localize('com_auth_error_invalid_reset_token')}{' '}
            <a className="font-semibold text-green-600 hover:underline" href="/forgot-password">
              {localize('com_auth_click_here')}
            </a>{' '}
            {localize('com_auth_to_try_again')}
          </ErrorMessage>
        </div>
      );
    } else if (error != null && error) {
      return (
        <div className="mx-auto sm:max-w-sm">
          <ErrorMessage>{localize(error)}</ErrorMessage>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="relative flex min-h-screen flex-col bg-gray-50 dark:bg-gray-900">
      <Banner />
      <div className="absolute bottom-0 left-0 md:m-4">
        <ThemeSelector />
      </div>
      <DisplayError />
      <main className="flex flex-grow items-center justify-center px-4">
        <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-gray-200 bg-white px-8 py-10 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <BlinkAnimation active={isFetching}>
            <div className="mb-6 flex items-center justify-center gap-4">
              <img
                src="assets/logo-xueyuan.png"
                alt="北京中关村学院"
                className="h-20 w-20 object-contain"
              />
              <span
                className="select-none text-xl font-light text-gray-400 dark:text-gray-500"
                aria-hidden="true"
              >
                ×
              </span>
              <img
                src="assets/logo-yanjiuyuan.png"
                alt="中关村人工智能研究院"
                className="h-20 w-20 object-contain"
              />
            </div>
          </BlinkAnimation>
          {!hasStartupConfigError && !isFetching && (
            <div className="mb-6 text-center" style={{ userSelect: 'none' }}>
              <p className="text-xl font-bold tracking-wider text-[#1a237e] dark:text-blue-300">
                中关村两院
              </p>
              <p className="mt-1 text-sm font-medium tracking-[0.18em] text-gray-500 dark:text-gray-400">
                LLM 对话平台
              </p>
              <div className="mx-auto mt-4 h-px w-16 bg-gray-200 dark:bg-gray-600" />
            </div>
          )}
          {children}
          {!pathname.includes('2fa') &&
            (pathname.includes('login') || pathname.includes('register')) && (
              <SocialLoginRender startupConfig={startupConfig} />
            )}
        </div>
      </main>
      <Footer startupConfig={startupConfig} />
    </div>
  );
}

export default AuthLayout;
